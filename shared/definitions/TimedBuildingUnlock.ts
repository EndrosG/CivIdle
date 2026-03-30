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
   SantaClausVillage: { tech: "Theocracy", condition: isChristmas },
   YearOfTheSnake: {
      tech: "Theater",
      condition: isLunarNewYear,
   },
   EasterBunny: {
      tech: "PrivateOwnership",
      condition: (now) => now.getMonth() === 3 || IGNORE_TIMING,
   },

   // Added by Lydia
   TourDeFrance: { tech: "Olympics", condition: (now) => now.getMonth() === 6 || IGNORE_TIMING },
   GiroDItalia: { tech: "Olympics", condition: (now) => now.getMonth() === 4 || IGNORE_TIMING },

   ValentinesDay: { tech: "HolidayCustoms", condition: (now) => (now.getMonth() === 1 && now.getDate() >= 7 && now.getDate() <= 21) || IGNORE_TIMING },
   WomensDay: { tech: "HolidayCustoms", condition: (now) => (now.getMonth() === 2 && now.getDate() <= 15) || IGNORE_TIMING },
   ChildrensDay: { tech: "HolidayCustoms", condition: (now) => (now.getMonth() === 4 && now.getDate() >= 25) || (now.getMonth() === 5 && now.getDate() <= 8) || IGNORE_TIMING },
   WorldChildrensDay: { tech: "HolidayCustoms", condition: (now) => (now.getMonth() === 10 && now.getDate() >= 13 && now.getDate() <= 27) || IGNORE_TIMING },
   LabourDay: { tech: "HolidayCustoms", condition: (now) => (now.getMonth() === 3 && now.getDate() >= 24) || (now.getMonth() === 4 && now.getDate() <= 8) || IGNORE_TIMING },
   FathersDay: { tech: "HolidayCustoms", condition: (now) => (now.getMonth() === 4 && now.getDate() >= 7 && now.getDate() <= 21) || IGNORE_TIMING },
   MothersDay: { tech: "HolidayCustoms", condition: (now) => (now.getMonth() === 4 && now.getDate() >= 3 && now.getDate() <= 17) || IGNORE_TIMING },
};

export function isHalloween(now: Date): boolean {
   return (now.getMonth() === 9 && now.getDate() >= 15) || (now.getMonth() === 10 && now.getDate() <= 15) || IGNORE_TIMING;
}

export function isChristmas(now: Date): boolean {
   return now.getMonth() === 11 || IGNORE_TIMING;
}

export function isLunarNewYear(now: Date): boolean {
   return (now.getMonth() === 1 && now.getDate() >= 10 && now.getDate() <= 24) || IGNORE_TIMING;
}
