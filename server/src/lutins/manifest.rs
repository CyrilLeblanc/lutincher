//! Lutin asset catalog: manifest types and lazy loading of the SVG fragments
//! shipped in `server/assets/lutins` (authored by the assets wave).

use std::collections::HashMap;
use std::path::Path;
use std::sync::LazyLock;

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Asset pack root, resolved at compile time so the working directory
/// never matters (cargo run, cargo test, container).
const ASSETS_DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/assets/lutins");

/// Collection value per rarity rank (commun, rare, epique, legendaire).
/// Leaderboards sum these over the lutins each player won (auctions wave);
/// `Rarity::value` (below) is the access path for the auctions wave (G).
pub const RARITY_VALUE: [i64; 4] = [10, 50, 200, 800];

/// Rarity tier. Declaration order is the tier order:
/// `Commun < Rare < Epique < Legendaire`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Rarity {
    Commun,
    Rare,
    Epique,
    Legendaire,
}

impl Rarity {
    /// Tier rank, 0 (commun) to 3 (legendaire).
    pub fn rank(self) -> usize {
        self as usize
    }

    /// Tier from its rank, clamped to the valid range.
    pub fn from_rank(rank: usize) -> Self {
        match rank {
            0 => Rarity::Commun,
            1 => Rarity::Rare,
            2 => Rarity::Epique,
            _ => Rarity::Legendaire,
        }
    }

    /// Collection value of lutins minted at this tier.
    pub fn value(self) -> i64 {
        RARITY_VALUE[self.rank()]
    }

    /// Stable string form, shared by the DB `rarity` column and the API.
    pub fn as_str(self) -> &'static str {
        match self {
            Rarity::Commun => "commun",
            Rarity::Rare => "rare",
            Rarity::Epique => "epique",
            Rarity::Legendaire => "legendaire",
        }
    }
}

/// One pickable asset inside a slot.
#[derive(Debug, Clone, Deserialize)]
pub struct Asset {
    pub id: String,
    #[allow(dead_code)] // labels are served through the raw manifest (/parts)
    pub label: String,
    pub rarity: Rarity,
}

/// One stackable layer of the final image.
#[derive(Debug, Clone, Deserialize)]
pub struct Slot {
    pub id: String,
    /// Paint order: fragments stack by ascending z.
    pub z: i32,
    #[allow(dead_code)] // labels are served through the raw manifest (/parts)
    pub label: String,
    pub assets: Vec<Asset>,
}

/// Syllable pools for procedural names.
#[derive(Debug, Clone, Deserialize)]
pub struct Names {
    pub prefixes: Vec<String>,
    pub cores: Vec<String>,
    pub suffixes: Vec<String>,
}

/// Shape of `manifest.json`.
#[derive(Debug, Clone, Deserialize)]
struct Manifest {
    slots: Vec<Slot>,
    names: Names,
}

/// Loaded asset pack: z-sorted slots plus every SVG fragment, keyed
/// `"{slot_id}-{asset_id}"`.
pub struct Catalog {
    slots: Vec<Slot>,
    names: Names,
    /// Raw `manifest.json`, served verbatim by `GET /api/admin/lutins/parts`.
    raw: Value,
    fragments: HashMap<String, String>,
}

impl Catalog {
    /// Reads and validates the asset pack. Every declared asset must exist on
    /// disk, and every slot must keep a commun asset so all four tiers stay
    /// drawable (asset spec, "minimum garanti").
    fn load() -> Result<Self, String> {
        let dir = Path::new(ASSETS_DIR);
        let manifest_text = read_file(&dir.join("manifest.json"))?;
        let raw: Value = serde_json::from_str(&manifest_text)
            .map_err(|err| format!("invalid manifest.json: {err}"))?;
        let manifest: Manifest = serde_json::from_value(raw.clone())
            .map_err(|err| format!("manifest.json does not match the expected shape: {err}"))?;

        let mut slots = manifest.slots;
        slots.sort_by_key(|slot| slot.z);

        let mut fragments = HashMap::new();
        for slot in &slots {
            if !slot.assets.iter().any(|a| a.rarity == Rarity::Commun) {
                return Err(format!(
                    "slot '{}' has no commun asset; every tier must stay drawable",
                    slot.id
                ));
            }
            for asset in &slot.assets {
                let file = format!("{}-{}.svg", slot.id, asset.id);
                let body = read_file(&dir.join("svg").join(&file))?;
                fragments.insert(format!("{}-{}", slot.id, asset.id), body);
            }
        }

        let names = manifest.names;
        if names.prefixes.is_empty() || names.cores.is_empty() || names.suffixes.is_empty() {
            return Err("manifest.json: prefixes, cores and suffixes must be non-empty".to_owned());
        }
        Ok(Self { slots, names, raw, fragments })
    }

    /// Slots in paint (z) order.
    pub fn slots(&self) -> &[Slot] {
        &self.slots
    }

    pub fn names(&self) -> &Names {
        &self.names
    }

    /// Verbatim `manifest.json` (labels and names included, fragments excluded).
    pub fn raw(&self) -> &Value {
        &self.raw
    }

    pub fn slot(&self, slot_id: &str) -> Option<&Slot> {
        self.slots.iter().find(|slot| slot.id == slot_id)
    }

    /// Asset declared under `slot_id` with this id, if any.
    pub fn asset(&self, slot_id: &str, asset_id: &str) -> Option<&Asset> {
        self.slot(slot_id)?
            .assets
            .iter()
            .find(|asset| asset.id == asset_id)
    }

    /// SVG fragment body for a slot/asset pair, if the asset exists.
    pub fn fragment(&self, slot_id: &str, asset_id: &str) -> Option<&str> {
        self.fragments
            .get(&format!("{slot_id}-{asset_id}"))
            .map(String::as_str)
    }
}

fn read_file(path: &Path) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|err| format!("cannot read {}: {err}", path.display()))
}

static CATALOG: LazyLock<Catalog> = LazyLock::new(|| {
    Catalog::load().unwrap_or_else(|err| panic!("lutin asset pack failed to load: {err}"))
});

/// Global catalog, loaded on first access (forced at startup, see `warmup`).
pub fn catalog() -> &'static Catalog {
    &CATALOG
}

/// Forces catalog loading; the lutins router calls this once at startup so a
/// broken asset pack fails fast instead of panicking mid-request.
pub fn warmup() {
    LazyLock::force(&CATALOG);
}
