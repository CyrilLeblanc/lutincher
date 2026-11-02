//! Deterministic lutin generation engine: rarity roll, tier-constrained
//! per-slot draws, procedural names and SVG re-assembly. Pure module — the
//! only I/O is the bundled asset catalog; no network, no database.

use std::collections::BTreeMap;

use rand::rngs::StdRng;
use rand::seq::IndexedRandom;
use rand::{Rng, SeedableRng};

use super::manifest::{catalog, Asset, Rarity, Slot};

/// Slot/asset pair forced for legendary lutins (the golden body).
const BODY_SLOT: &str = "body";
const GOLDEN_BODY: &str = "dore";

/// Shared canvas wrapper for assembled fragments (asset spec).
const SVG_OPEN: &str =
    r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">"#;
const SVG_CLOSE: &str = "</svg>";

/// Rarity roll weights out of 100: 60/30/9/1 (cahier des charges §3.2).
const RARITY_WEIGHTS: [u32; 4] = [60, 30, 9, 1];

/// Bounded, deterministic redraw budget while the tier-exactness invariant
/// is not met yet.
const MAX_ATTEMPTS: u8 = 64;

/// Per-slot asset override: slot_id -> asset_id. Primes over the draw.
pub type Overrides = BTreeMap<String, String>;

/// Outcome of a generation: everything persisted with, and displayed for,
/// one lutin.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LutinBuild {
    pub rarity: Rarity,
    pub name: String,
    /// Chosen parts, slot_id -> asset_id. Persisted as the `manifest` JSONB
    /// column; enough on its own to re-assemble the SVG.
    pub manifest: BTreeMap<String, String>,
}

/// Generation/assembly failures; the routes map them to typed API errors.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum LutinError {
    /// Input (override or stored manifest) references an unknown asset id.
    #[error("unknown asset '{asset_id}' for slot '{slot_id}'")]
    UnknownAsset { slot_id: String, asset_id: String },
    /// Input references an unknown slot id.
    #[error("unknown slot '{0}'")]
    UnknownSlot(String),
    /// Stored manifest is missing a slot entirely (corrupt row).
    #[error("manifest has no part for slot '{0}'")]
    MissingPart(String),
}

/// Rolls a full lutin from a seed. The RNG is seeded by `seed`, so the same
/// input always yields the same build. `rarity` forces the tier when given;
/// `overrides` pin chosen slots to chosen assets.
pub fn generate(
    seed: u64,
    rarity: Option<Rarity>,
    overrides: &Overrides,
) -> Result<LutinBuild, LutinError> {
    validate_overrides(overrides)?;
    let mut rng = StdRng::seed_from_u64(seed);
    let tier = rarity.unwrap_or_else(|| roll_rarity(&mut rng));
    let mut manifest = BTreeMap::new();
    // Bounded redraw loop; the last draw is kept when the invariant stays
    // unsatisfiable (e.g. every tier-exact slot is overridden).
    for _ in 0..MAX_ATTEMPTS {
        manifest.clear();
        for slot in catalog().slots() {
            let asset_id = match overrides.get(&slot.id) {
                Some(pinned) => pinned.clone(),
                None => draw_asset(&mut rng, slot, tier).to_owned(),
            };
            manifest.insert(slot.id.clone(), asset_id);
        }
        // Legendary lutins always wear the golden body (unless overridden).
        if tier == Rarity::Legendaire && !overrides.contains_key(BODY_SLOT) {
            manifest.insert(BODY_SLOT.to_owned(), GOLDEN_BODY.to_owned());
        }
        if tier_exact_part_exists(tier, overrides, &manifest) {
            break;
        }
    }
    let name = generate_name(&mut rng);
    Ok(LutinBuild { rarity: tier, name, manifest })
}

/// Re-assembles the SVG from a parts manifest (as persisted in the DB):
/// fragments stacked in z order inside the shared 200x200 wrapper. No SVG is
/// ever stored — the manifest alone is enough.
pub fn assemble_svg(manifest: &BTreeMap<String, String>) -> Result<String, LutinError> {
    let cat = catalog();
    let mut svg = String::with_capacity(2048);
    svg.push_str(SVG_OPEN);
    svg.push('\n');
    for slot in cat.slots() {
        let asset_id = manifest
            .get(&slot.id)
            .ok_or_else(|| LutinError::MissingPart(slot.id.clone()))?;
        let fragment = cat.fragment(&slot.id, asset_id).ok_or_else(|| {
            LutinError::UnknownAsset { slot_id: slot.id.clone(), asset_id: asset_id.clone() }
        })?;
        svg.push_str(fragment.trim());
        svg.push('\n');
    }
    svg.push_str(SVG_CLOSE);
    Ok(svg)
}

/// Rejects overrides pointing at slots or assets that do not exist.
fn validate_overrides(overrides: &Overrides) -> Result<(), LutinError> {
    let cat = catalog();
    for (slot_id, asset_id) in overrides {
        if cat.slot(slot_id).is_none() {
            return Err(LutinError::UnknownSlot(slot_id.clone()));
        }
        if cat.asset(slot_id, asset_id).is_none() {
            return Err(LutinError::UnknownAsset {
                slot_id: slot_id.clone(),
                asset_id: asset_id.clone(),
            });
        }
    }
    Ok(())
}

/// Uniformly picks an asset of rarity <= tier for the slot.
fn draw_asset<'a>(rng: &mut StdRng, slot: &'a Slot, tier: Rarity) -> &'a str {
    let pool: Vec<&Asset> = slot.assets.iter().filter(|a| a.rarity <= tier).collect();
    // Non-empty by construction: the catalog load check guarantees every
    // slot has a commun asset, and commun is the lowest tier.
    &pool.choose(rng).expect("pool is non-empty (validated at catalog load)").id
}

/// Invariant: at least one engine-decided slot (draw or forced golden body,
/// overrides excluded) sits exactly at the target tier.
fn tier_exact_part_exists(
    tier: Rarity,
    overrides: &Overrides,
    manifest: &BTreeMap<String, String>,
) -> bool {
    let cat = catalog();
    cat.slots().iter().any(|slot| {
        if overrides.contains_key(&slot.id) {
            return false;
        }
        let Some(asset_id) = manifest.get(&slot.id) else {
            return false;
        };
        cat.asset(&slot.id, asset_id).is_some_and(|asset| asset.rarity == tier)
    })
}

/// Rolls the rarity tier from the 60/30/9/1 weights.
fn roll_rarity(rng: &mut StdRng) -> Rarity {
    let total: u32 = RARITY_WEIGHTS.iter().sum();
    let mut roll = rng.random_range(0..total);
    for (rank, weight) in RARITY_WEIGHTS.iter().enumerate() {
        if roll < *weight {
            return Rarity::from_rank(rank);
        }
        roll -= *weight;
    }
    Rarity::from_rank(RARITY_WEIGHTS.len() - 1)
}

/// `prefix + core`, plus a suffix about half the time; deterministic per rng.
fn generate_name(rng: &mut StdRng) -> String {
    let pools = catalog().names();
    let mut name = format!("{} {}", pick(rng, &pools.prefixes), pick(rng, &pools.cores));
    if rng.random_bool(0.5) {
        name.push(' ');
        name.push_str(pick(rng, &pools.suffixes));
    }
    name
}

/// Uniform pick; name pools are validated non-empty at catalog load.
fn pick<'a>(rng: &mut StdRng, pool: &'a [String]) -> &'a str {
    pool.choose(rng).expect("name pools are validated non-empty at catalog load")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lutins::manifest::RARITY_VALUE;

    fn empty() -> Overrides {
        Overrides::new()
    }

    #[test]
    fn same_seed_yields_the_same_build() {
        let a = generate(42, None, &empty()).unwrap();
        let b = generate(42, None, &empty()).unwrap();
        assert_eq!(a, b);
        assert_eq!(
            assemble_svg(&a.manifest).unwrap(),
            assemble_svg(&b.manifest).unwrap()
        );
        assert_eq!(
            generate(42, Some(Rarity::Epique), &empty()).unwrap(),
            generate(42, Some(Rarity::Epique), &empty()).unwrap()
        );
    }

    #[test]
    fn forced_rarity_constrains_every_tier() {
        let tiers = [
            (Rarity::Commun, 10),
            (Rarity::Rare, 50),
            (Rarity::Epique, 200),
            (Rarity::Legendaire, 800),
        ];
        for (tier, value) in tiers {
            let build = generate(11, Some(tier), &empty()).unwrap();
            assert_eq!(build.rarity, tier);
            assert_eq!(RARITY_VALUE[build.rarity.rank()], value);
            for (slot_id, asset_id) in &build.manifest {
                let rarity = catalog().asset(slot_id, asset_id).unwrap().rarity;
                assert!(rarity <= tier, "{slot_id}/{asset_id} above tier");
            }
        }
    }

    #[test]
    fn legendary_forces_the_golden_body() {
        for seed in 0..10u64 {
            let build = generate(seed, Some(Rarity::Legendaire), &empty()).unwrap();
            assert_eq!(build.manifest[BODY_SLOT], GOLDEN_BODY);
        }
    }

    #[test]
    fn tier_exact_invariant_holds_on_drawn_slots() {
        for seed in 0..30u64 {
            for tier in [Rarity::Rare, Rarity::Epique, Rarity::Legendaire] {
                let build = generate(seed, Some(tier), &empty()).unwrap();
                assert!(
                    tier_exact_part_exists(tier, &empty(), &build.manifest),
                    "seed {seed} tier {tier:?} lacks a tier-exact part"
                );
            }
        }
    }

    #[test]
    fn overrides_pin_their_slots() {
        let mut overrides = Overrides::new();
        overrides.insert("hat".to_owned(), "none".to_owned());
        // An epique asset on a rare build: overrides prime over the tier rule.
        overrides.insert("accessory".to_owned(), "baguette-magique".to_owned());
        let build = generate(5, Some(Rarity::Rare), &overrides).unwrap();
        assert_eq!(build.manifest["hat"], "none");
        assert_eq!(build.manifest["accessory"], "baguette-magique");
        assert_eq!(build.manifest.len(), catalog().slots().len());
    }

    #[test]
    fn unknown_override_targets_are_rejected() {
        let mut bad_asset = Overrides::new();
        bad_asset.insert("hat".to_owned(), "turban-trop-magique".to_owned());
        assert_eq!(
            generate(5, None, &bad_asset),
            Err(LutinError::UnknownAsset {
                slot_id: "hat".to_owned(),
                asset_id: "turban-trop-magique".to_owned()
            })
        );
        let mut bad_slot = Overrides::new();
        bad_slot.insert("turban".to_owned(), "none".to_owned());
        assert_eq!(
            generate(5, None, &bad_slot),
            Err(LutinError::UnknownSlot("turban".to_owned()))
        );
    }

    #[test]
    fn fully_overridden_build_is_kept_as_is() {
        let mut overrides = Overrides::new();
        for slot in catalog().slots() {
            let commun = slot.assets.iter().find(|a| a.rarity == Rarity::Commun).unwrap();
            overrides.insert(slot.id.clone(), commun.id.clone());
        }
        let build = generate(1, Some(Rarity::Epique), &overrides).unwrap();
        assert_eq!(build.manifest, overrides);
    }

    #[test]
    fn svg_stacks_every_fragment_in_z_order() {
        let build = generate(3, None, &empty()).unwrap();
        let svg = assemble_svg(&build.manifest).unwrap();
        assert!(svg.starts_with(SVG_OPEN));
        assert!(svg.ends_with(SVG_CLOSE));
        let mut cursor = 0;
        for slot in catalog().slots() {
            let asset_id = &build.manifest[&slot.id];
            let fragment = catalog().fragment(&slot.id, asset_id).unwrap().trim();
            let at = svg.find(fragment).unwrap_or_else(|| {
                panic!("missing fragment for {}/{}", slot.id, asset_id)
            });
            assert!(at >= cursor, "slot {} breaks the z order", slot.id);
            cursor = at;
        }
    }

    #[test]
    fn assemble_reports_unknown_or_missing_parts() {
        let mut missing = BTreeMap::new();
        missing.insert("background".to_owned(), "neige".to_owned());
        assert_eq!(
            assemble_svg(&missing),
            Err(LutinError::MissingPart("body".to_owned()))
        );
        let mut unknown = BTreeMap::new();
        unknown.insert("background".to_owned(), "neige".to_owned());
        unknown.insert("body".to_owned(), "classique".to_owned());
        unknown.insert("ears".to_owned(), "pointues".to_owned());
        unknown.insert("eyes".to_owned(), "perles".to_owned());
        unknown.insert("hat".to_owned(), "none".to_owned());
        unknown.insert("accessory".to_owned(), "tricone".to_owned());
        assert_eq!(
            assemble_svg(&unknown),
            Err(LutinError::UnknownAsset {
                slot_id: "accessory".to_owned(),
                asset_id: "tricone".to_owned()
            })
        );
    }

    #[test]
    fn rarity_weights_hold_over_2000_rolls() {
        const DRAWS: u64 = 2000;
        let mut commun = 0;
        for seed in 0..DRAWS {
            if generate(seed, None, &empty()).unwrap().rarity == Rarity::Commun {
                commun += 1;
            }
        }
        let ratio = commun as f64 / DRAWS as f64;
        assert!(
            (0.55..=0.65).contains(&ratio),
            "commun ratio out of range: {ratio}"
        );
    }

    #[test]
    fn names_use_the_manifest_pools() {
        let pools = catalog().names();
        for seed in 0..50u64 {
            let name = generate(seed, None, &empty()).unwrap().name;
            assert!(pools.prefixes.iter().any(|p| name.starts_with(p)), "{name}");
            assert!(pools.cores.iter().any(|c| name.contains(c)), "{name}");
        }
    }
}
