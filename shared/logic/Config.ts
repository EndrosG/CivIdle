import { BuildingDefinitions, type Building } from "../definitions/BuildingDefinitions";
import { CityDefinitions, type City } from "../definitions/CityDefinitions";
import { GreatPersonDefinitions } from "../definitions/GreatPersonDefinitions";
import { IdeologyDefinitions } from "../definitions/IdeologyDefinitions";
import { MaterialDefinitions, type Material } from "../definitions/MaterialDefinitions";
import { ReligionDefinitions } from "../definitions/ReligionDefinitions";
import { TechAgeDefinitions, TechDefinitions, type Tech, type TechAge } from "../definitions/TechDefinitions";
import { TraditionDefinitions } from "../definitions/TraditionDefinitions";
import { UpgradeDefinitions } from "../definitions/UpgradeDefinitions";
import type { PartialTabulate } from "../utilities/TypeDefinitions";

const BuildingTier: PartialTabulate<Building> = {};
const BuildingTech: Partial<Record<Building, Tech>> = {};
const BuildingTechAge: Partial<Record<Building, TechAge>> = {};
const BuildingCity: Partial<Record<Building, City>> = {};

const MaterialInputs: PartialTabulate<Material> = {}; // Added by Lydia, represents complexity of any material, equals the number of inputs in production
const MaterialMultiplier: PartialTabulate<Material> = {}; // Added by Lydia, constants.tsx: const multiplier = 1.5 + 0.25 * sizeOf(input);
const MaterialTier: PartialTabulate<Material> = {};
const MaterialPrice: PartialTabulate<Material> = {};
const MaterialTech: PartialTabulate<Material> = {};

const BuildingHash: PartialTabulate<Building> = {};
const MaterialHash: PartialTabulate<Material> = {};

export const Config = {
   Building: new BuildingDefinitions(),
   Material: new MaterialDefinitions(),
   GreatPerson: new GreatPersonDefinitions(),
   City: new CityDefinitions(),
   Tech: new TechDefinitions(),
   TechAge: new TechAgeDefinitions(),
   Tradition: new TraditionDefinitions(),
   Religion: new ReligionDefinitions(),
   Ideology: new IdeologyDefinitions(),
   Upgrade: new UpgradeDefinitions(),
   BuildingTier,
   BuildingTech,
   BuildingTechAge,
   BuildingCity,
   MaterialInputs,
   MaterialMultiplier,
   MaterialTier,
   MaterialTech,
   MaterialPrice,
   BuildingHash,
   MaterialHash,
} as const;
