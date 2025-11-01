import type { Building } from "./BuildingDefinitions";
import type { Tech } from "./TechDefinitions";

interface ITimedBuildingUnlock {
   tech: Tech;
   condition: (now: Date) => boolean;
}

// Lydia:
// allow to completely ignore the timed condition
// cannot be set in GLOBAL_PARAMS because of circle reference
const IGNORE_TIMING = true;

export const TimedBuildingUnlock: Partial<Record<Building, ITimedBuildingUnlock>> = {
   BranCastle: {
      tech: "HolyEmpire",
      condition: isHalloween,
   },
   SantaClausVillage: { tech: "Theocracy", condition: (now) => now.getMonth() === 11 || IGNORE_TIMING },
   YearOfTheSnake: {
      tech: "Theater",
      condition: (now) => {
         return (now.getMonth() === 0 && now.getDate() >= 20) || (now.getMonth() === 1 && now.getDate() <= 10) || IGNORE_TIMING;
      },
   },
   EasterBunny: {
      tech: "PrivateOwnership",
      condition: (now) => now.getMonth() === 3 || IGNORE_TIMING,
   },
   TourDeFrance: { tech: "Olympics", condition: (now) => now.getMonth() === 6 || IGNORE_TIMING },
   GiroDItalia: { tech: "Olympics", condition: (now) => now.getMonth() === 4 || IGNORE_TIMING },
};

export function isHalloween(now: Date): boolean {
   return (now.getMonth() === 9 && now.getDate() >= 15) || (now.getMonth() === 10 && now.getDate() <= 15) || IGNORE_TIMING;
}
