import type { Building } from "../definitions/BuildingDefinitions";
import type { IUnlockable } from "../definitions/ITechDefinition";
import { NoPrice, NoStorage, type Resource } from "../definitions/ResourceDefinitions";
import type { Tech } from "../definitions/TechDefinitions";
import type { AccountLevel } from "../utilities/Database";
import type { IGrid } from "../utilities/Grid";
import {
   HOUR,
   clamp,
   filterInPlace,
   filterOf,
   forEach,
   formatNumber,
   hasFlag,
   isEmpty,
   isNullOrUndefined,
   keysOf,
   mapSafeAdd,
   mapSafePush,
   pointToTile,
   safeAdd,
   shuffle,
   sizeOf,
   tileToHash,
   tileToPoint,
   type Tile,
} from "../utilities/Helper";
import { srand } from "../utilities/Random";
import { TypedEvent } from "../utilities/TypedEvent";
import { L, t } from "../utilities/i18n";
import {
   IOFlags,
   addTransportation,
   canBeElectrified,
   deductResources,
   filterNonTransportable,
   filterTransportable,
   findSpecialBuilding,
   getAvailableResource,
   getAvailableWorkers,
   getBuilderCapacity,
   getBuildingCost,
   getBuildingValue,
   getCurrentPriority,
   getElectrificationLevel,
   getInputMode,
   getMarketBuyAmount,
   getMarketSellAmount,
   getMaxInputDistance,
   getMultipliersFor,
   getPowerRequired,
   getResourceImportCapacity,
   getResourceImportIdleCapacity,
   getStockpileCapacity,
   getStockpileMax,
   getStorageFor,
   getStorageRequired,
   getTotalBuildingCost,
   getWorkersFor,
   getWorkingBuilding,
   hasEnoughResources,
   hasRequiredDeposit,
   isFestival,
   isNaturalWonder,
   isSpecialBuilding,
   isTransportable,
   isWorldWonder,
   totalLevelBoostFor,
   totalMultiplierFor,
   useWorkers,
} from "./BuildingLogic";
import { Config } from "./Config";
import { GLOBAL_PARAMS, MANAGED_IMPORT_RANGE } from "./Constants";
import { GameFeature, hasFeature } from "./FeatureLogic";
import type { GameState } from "./GameState";
import { getGameOptions } from "./GameStateLogic";
import {
   getBuildingIO,
   getBuildingsByType,
   getFuelByTarget,
   getGrid,
   getStorageFullBuildings,
   getXyBuildings,
   unlockedResources,
} from "./IntraTickCache";
import { calculateEmpireValue } from "./RebirthLogic";
import { getAmountInTransit } from "./ResourceLogic";
import type { MultiplierWithStability } from "./TickLogic";
import { NotProducingReason, Tick } from "./TickLogic";
import {
   BuildingInputMode,
   MarketOptions,
   ResourceImportOptions,
   SuspendedInput,
   SwissBankFlags,
   WarehouseOptions,
   type IBuildingData,
   type ICloneBuildingData,
   type IMarketBuildingData,
   type IResourceImportBuildingData,
   type ISwissBankBuildingData,
   type ITileData,
   type IWarehouseBuildingData,
} from "./Tile";
import { Transports, type ITransportationDataV2 } from "./Transports";

export const OnPriceUpdated = new TypedEvent<GameState>();
export const OnBuildingComplete = new TypedEvent<Tile>();
export const OnBuildingOrUpgradeComplete = new TypedEvent<Tile>();
export const OnTechUnlocked = new TypedEvent<Tech>();
export const OnBuildingProductionComplete = new TypedEvent<{ xy: Tile; offline: boolean }>();
export const RequestFloater = new TypedEvent<{ xy: Tile; amount: number }>();
export const RequestChooseGreatPerson = new TypedEvent<{ permanent: boolean }>();
export const OnEligibleAccountRankUpdated = new TypedEvent<AccountLevel>();

export function tickUnlockable(td: IUnlockable, source: string, gs: GameState): void {
   td.unlockBuilding?.forEach((b) => {
      Tick.next.unlockedBuildings.add(b);
   });
   forEach(td.buildingMultiplier, (k, v) => {
      addMultiplier(k, v, source);
   });
   forEach(td.globalMultiplier, (k, v) => {
      Tick.next.globalMultipliers[k].push({ value: v, source });
   });
   td.tick?.(gs);
}

export function tickTransports(gs: GameState): void {
   const grid = getGrid(gs);
   filterInPlace(Transports, (transport) => {
      // Has arrived!
      if (tickTransport(transport, grid)) {
         const targetBuilding = gs.tiles.get(transport.toXy)?.building;
         if (targetBuilding) {
            completeTransport(targetBuilding, transport.resource, transport.amount);
         }
         return false;
      }

      const ev = calculateEmpireValue(transport.resource, transport.amount);
      mapSafeAdd(Tick.next.resourceValues, transport.resource, ev);
      mapSafeAdd(
         Tick.next.amountInTransit,
         hashTileAndRes(transport.toXy, transport.resource),
         transport.amount,
      );
      Tick.next.totalValue += ev;
      return true;
   });
}

export function completeTransport(targetBuilding: IBuildingData, resource: Resource, amount: number) {
   safeAdd(targetBuilding.resources, resource, amount);
   if (targetBuilding.type === "CloneFactory") {
      const clone = targetBuilding as ICloneBuildingData;
      clone.transportedAmount += amount;
   }
}

function tickTransport(transport: ITransportationDataV2, grid: IGrid): boolean {
   const totalTick = grid.distanceTile(transport.fromXy, transport.toXy);

   // TODO: This needs to be double checked when fuel is implemented!
   if (isTransportable(transport.fuel)) {
      transport.ticksSpent++;
      transport.hasEnoughFuel = true;
      return transport.ticksSpent >= totalTick;
   }

   transport.fuelCurrentTick = transport.fuelPerTick;
   if (getAvailableWorkers(transport.fuel) >= transport.fuelCurrentTick) {
      useWorkers(transport.fuel, transport.fuelCurrentTick, null);
      mapSafeAdd(getFuelByTarget(), transport.toXy, transport.fuelCurrentTick);
      transport.ticksSpent++;
      transport.hasEnoughFuel = true;
   } else {
      transport.hasEnoughFuel = false;
   }

   return transport.ticksSpent >= totalTick;
}

// This needs to be called after tickTiles
export function tickPower(gs: GameState): void {
   const grid = getGrid(gs);

   Tick.next.powerPlants.forEach((tile) => {
      for (const point of grid.getNeighbors(tileToPoint(tile))) {
         Tick.next.powerGrid.add(pointToTile(point));
      }
   });

   let size = 0;
   do {
      size = Tick.next.powerGrid.size;
      Tick.next.powerBuildings.forEach((tile) => {
         if (Tick.next.powerGrid.has(tile)) {
            for (const point of grid.getNeighbors(tileToPoint(tile))) {
               Tick.next.powerGrid.add(pointToTile(point));
            }
         }
      });
   } while (size !== Tick.next.powerGrid.size);
}

export function getSortedTiles(gs: GameState): [Tile, IBuildingData][] {
   return Array.from(getXyBuildings(gs)).sort(([_a, buildingA], [_b, buildingB]) => {
      const diff = getCurrentPriority(buildingB, gs) - getCurrentPriority(buildingA, gs);
      if (diff !== 0) {
         return diff;
      }
      // Low tiers have higher priority
      const tier = (Config.BuildingTier[buildingA.type] ?? 0) - (Config.BuildingTier[buildingB.type] ?? 0);
      return tier;
   });
}

const resourceSet = new Set<Resource>();

export function transportAndConsumeResources(
   xy: Tile,
   result: IProduceResource[],
   gs: GameState,
   offline: boolean,
): void {
   const tile = gs.tiles.get(xy);
   if (!tile) {
      return;
   }
   const building = tile.building;
   if (!building) {
      return;
   }
   if (isNaturalWonder(building.type) && !tile.explored) {
      return;
   }

   const transportSourceCache = offline || getGameOptions().enableTransportSourceCache;

   if (!transportResource) {
      clearTransportSourceCache();
   }

   // Modified by Lydia
   if (building.status === "completed") {
      if (building.desiredLevel > building.level) {
         building.status = building.level > 0 ? "upgrading" : "building";
      } else if (
         building.desiredLevel < building.level &&
         building.desiredLevel >= building.level - 5 &&
         building.desiredLevel > 0
      ) {
         building.status = "downgrading";
      } else {
         building.desiredLevel = building.level;
      }
   }
   // Added by Lydia
   if (!building.stack) {
      building.stack = 1;
      building.desiredStack = 1;
   }
   if (
      GLOBAL_PARAMS.USE_STACKING &&
      building.status === "completed" &&
      building.desiredStack > building.stack
   ) {
      if (building.level === 0) {
         building.stack = building.desiredStack;
      } else {
         building.status = "stacking";
      }
   }

   // The following code is wrong, but I keep it here to avoid making the same mistake again. Don't assume
   // wonders don't have levels. Some do! Like Petra!
   // if (isSpecialBuilding(building.type)) {
   //    building.level = clamp(building.level, 0, 1);
   //    building.desiredLevel = clamp(building.desiredLevel, 0, 1);
   // }

   const bev = getBuildingValue(building);
   mapSafeAdd(Tick.next.buildingValueByTile, xy, bev);
   mapSafeAdd(Tick.next.buildingValues, building.type, bev);

   if (building.type !== "CentrePompidou") {
      Tick.next.totalValue += bev;
   }

   // Tabulate resources before we early return
   // Note that `resourcesByTile` includes buildings that are "building" and "upgrading".
   // This is for cache purpose. We will filter them out when actually transporting resources
   const { total, used } = getStorageFor(xy, gs);
   const output = getBuildingIO(xy, "output", IOFlags.Multiplier | IOFlags.Capacity, gs);

   const isResourceImportBuilding = "resourceImports" in building;

   resourceSet.clear();
   forEach(building.resources, (res, amount) => {
      if (!Number.isFinite(amount)) {
         return;
      }

      if (amount === 0) {
         delete building.resources[res];
         return;
      }

      const rev = calculateEmpireValue(res, amount);
      Tick.next.totalValue += rev;
      mapSafeAdd(Tick.next.resourceValueByTile, xy, rev);
      mapSafeAdd(Tick.next.resourceValues, res, rev);

      // Resource in buildings that are not completed are not tabulated because technically it is not
      // usable by other buildings. This is an old behavior that is apparently desired
      if (building.status === "completed") {
         mapSafeAdd(Tick.next.resourceAmount, res, amount);
      }

      // We do not add Warehouse/Caravansary in `resourcesByTile`, because we need to consider as transport
      // sources anyway!
      if (isResourceImportBuilding) {
         return;
      }
      resourceSet.add(res);
      mapSafePush(Tick.next.resourcesByTile, res, {
         tile: xy,
         amount,
         usedStoragePercentage: total === 0 ? 1 : used / total,
      });
   });

   // Here we add all output resources that are not already tabulated in the storage, for transport cache
   forEach(output, (res) => {
      if (resourceSet.has(res)) {
         return;
      }
      mapSafePush(Tick.next.resourcesByTile, res, {
         tile: xy,
         amount: 0,
         usedStoragePercentage: used / total,
      });
   });

   if (isResourceImportBuilding) {
      Tick.next.resourceImportBuildings.set(xy, {
         building: building as IResourceImportBuildingData,
         tile: xy,
         usedStoragePercentage: used / total,
      });
   }

   if (
      (building.status === "completed" ||
         building.status === "upgrading" ||
         building.status === "downgrading" ||
         building.status === "stacking") &&
      isSpecialBuilding(building.type)
   ) {
      Tick.next.specialBuildings.set(building.type, tile as Required<ITileData>);
   }

   if (building.status === "building" || building.status === "upgrading") {
      // adapted from lmc (liliannes modded client)
      if (Config.Building[building.type].power && building.level >= GLOBAL_PARAMS.BUILDINGS_HIGH_LEVEL) {
         Tick.next.powerBuildings.add(xy);
      }

      const cost = getBuildingCost(building);
      // Lydia: I still use full greedy mode for wonders! Because I do not play rover focus runs!
      const maxCost = getTotalBuildingCost(building, building.level, building.desiredLevel, building.stack);
      /*
      const maxCost = isWorldWonder(building.type)
         ? cost
         : getTotalBuildingCost(building, building.level, building.desiredLevel);
      */
      const { total } = getBuilderCapacity(building, xy, gs);
      const remainingAmount = new Map<Resource, number>();
      let completed = true;
      let maxCompleted = true;
      forEach(cost, function checkConstructionUpgradeResources(res, amount) {
         const amountArrived = building.resources[res] ?? 0;
         const amountInTransit = getAmountInTransit(xy, res);
         const threshold = getGameOptions().greedyTransport ? (maxCost[res] ?? 0) : amount;
         if (completed && amountArrived < amount) {
            completed = false;
         }
         if (maxCompleted && maxCost[res] && amountArrived < maxCost[res]) {
            maxCompleted = false;
         }
         // Already full
         if (amountArrived >= threshold) {
            building.suspendedInput.set(res, SuspendedInput.AutoSuspended);
            return;
         }
         // Will be full
         const amountLeft = threshold - amountInTransit - amountArrived;
         if (amountLeft <= 0) {
            return;
         }
         if (building.suspendedInput.get(res) === SuspendedInput.ManualSuspended) {
            return;
         }
         building.suspendedInput.delete(res);
         remainingAmount.set(res, amountLeft);
      });

      if (remainingAmount.size > 0) {
         const builderCapacityPerResource = total / remainingAmount.size;
         remainingAmount.forEach(function transportConstructionUpgradeResources(amount, res) {
            // Each transportation costs 1 worker, and deliver Total (=Builder Capacity x Multiplier) resources
            transportResource(
               res,
               clamp(amount, 0, builderCapacityPerResource),
               builderCapacityPerResource,
               xy,
               gs,
               getInputMode(building, gs),
               transportSourceCache,
            );
         });
      }

      // This has to be here before the `if (completed)` block. Otherwise there will be a one tick flicker
      // when upgrade completes:
      if (building.status === "upgrading" && isWorldWonder(building.type)) {
         OnBuildingProductionComplete.emit({ xy, offline });
      }

      if (maxCompleted && !isSpecialBuilding(building.type)) {
         // QuickPath aka Shortcut
         // does not fit for wonders (= SpecialBuildings) which need the OnBuildingOrUpgradeComplete fired for each single level
         building.level = building.desiredLevel;
         forEach(maxCost, (res, amount) => {
            safeAdd(building.resources, res, -amount);
         });
         building.suspendedInput.clear();
         let buildingComplete = false;
         if (building.status === "building") {
            building.status = building.desiredLevel > building.level ? "upgrading" : "completed";
            buildingComplete = true;
         }
         OnBuildingOrUpgradeComplete.emit(xy);
         // `OnBuildingComplete` should fire after `OnBuildingOrUpgradeComplete` because Wonder Complete Modal
         // is shown in `OnBuildingComplete`, which should not show if there are other modals open
         if (buildingComplete) {
            OnBuildingComplete.emit(xy);
         }
         if (building.status === "upgrading" && building.level >= building.desiredLevel) {
            building.status = "completed";
         }
      } else if (completed) {
         building.level++;
         forEach(cost, (res, amount) => {
            safeAdd(building.resources, res, -amount);
         });
         building.suspendedInput.clear();
         let buildingComplete = false;
         if (building.status === "building") {
            building.status = building.desiredLevel > building.level ? "upgrading" : "completed";
            buildingComplete = true;
         }
         OnBuildingOrUpgradeComplete.emit(xy);
         // `OnBuildingComplete` should fire after `OnBuildingOrUpgradeComplete` because Wonder Complete Modal
         // is shown in `OnBuildingComplete`, which should not show if there are other modals open
         if (buildingComplete) {
            OnBuildingComplete.emit(xy);
         }
         if (building.status === "upgrading" && building.level >= building.desiredLevel) {
            building.status = "completed";
         }
      }

      return;
   }

   // Added by Lydia
   if (building.status === "downgrading") {
      if (GLOBAL_PARAMS.DEBUG_DOWNGRADING) {
         addSystemMessage(
            `Computing Downgrading for ${building.type} level ${building.level} to desiredLevel ${building.desiredLevel}`,
         );
      }
      if (Config.Building[building.type].power && building.level >= GLOBAL_PARAMS.BUILDINGS_HIGH_LEVEL) {
         Tick.next.powerBuildings.add(xy);
      }
      building.level--;
      const cost = getBuildingCost(building);
      const completed = true;
      if (completed) {
         forEach(cost, (res, amount) => {
            safeAdd(building.resources, res, +amount);
         });
         building.suspendedInput.clear();
         OnBuildingOrUpgradeComplete.emit(xy);
         if (building.level <= building.desiredLevel) {
            if (GLOBAL_PARAMS.DEBUG_DOWNGRADING) {
               addSystemMessage(
                  `Completing Downgrading for ${building.type} level ${building.level} to desiredLevel ${building.desiredLevel}`,
               );
            }
            building.status = "completed";
         }
      }
      return;
   }
   if (building.status === "stacking") {
      if (Config.Building[building.type].power && building.level >= GLOBAL_PARAMS.BUILDINGS_HIGH_LEVEL) {
         Tick.next.powerBuildings.add(xy);
      }
      if (GLOBAL_PARAMS.DEBUG_STACKING) {
         addSystemMessage(
            `Computing Stacking for ${building.type} level ${building.level} curStack ${building.stack} desiredStack ${building.desiredStack}`,
         );
      }
      const prevCost = getTotalBuildingCost(building, 0, building.level, building.stack);
      const newCost = getTotalBuildingCost(building, 0, building.level, building.stack + 1);
      const fullCost = getTotalBuildingCost(building, 0, building.level, building.desiredStack);

      const cost = {};
      const maxCost = {};
      forEach(newCost, (res, amount) => safeAdd(cost, res, amount));
      forEach(fullCost, (res, amount) => safeAdd(maxCost, res, amount));
      forEach(prevCost, (res, amount) => safeAdd(cost, res, -amount));
      forEach(prevCost, (res, amount) => safeAdd(maxCost, res, -amount));

      if (GLOBAL_PARAMS.DEBUG_STACKING) {
         addSystemMessage(`Checking Stacking for ${building.type}`);
         addSystemMessage(JSON.stringify(cost));
         addSystemMessage(JSON.stringify(maxCost));
      }

      const { total: total2 } = getBuilderCapacity(building, xy, gs);
      const toTransport = /* @__PURE__ */ new Map();
      let completed = true;
      let maxCompleted = true;
      forEach(cost, function checkConstructionStackingResources(res, amount) {
         const amountArrived = building.resources[res] ?? 0;
         const amountInTransit = getAmountInTransit(xy, res);
         const threshold = getGameOptions().greedyTransport ? (maxCost[res] ?? 0) : amount;
         if (completed && amountArrived < amount) {
            completed = false;
         }
         if (maxCompleted && maxCost[res] && amountArrived < maxCost[res]) {
            maxCompleted = false;
         }
         // Already full
         if (amountArrived >= threshold) {
            building.suspendedInput.set(res, SuspendedInput.AutoSuspended);
            return;
         }
         // Will be full
         const amountLeft = threshold - amountInTransit - amountArrived;
         if (amountLeft <= 0) {
            return;
         }
         if (building.suspendedInput.get(res) === SuspendedInput.ManualSuspended) {
            return;
         }
         building.suspendedInput.delete(res);
         building.suspendedInput.delete(res);
         toTransport.set(res, amountLeft);
      });
      if (toTransport.size > 0) {
         const builderCapacityPerResource = total2 / toTransport.size;
         toTransport.forEach(function transportConstructionStackingResources(amount, res) {
            if (GLOBAL_PARAMS.DEBUG_STACKING) {
               addSystemMessage(
                  `Checking Stacking.toTransport for res ${res} with needed ${formatNumber(amount)}`,
               );
            }
            transportResource(
               res,
               clamp(amount, 0, builderCapacityPerResource),
               builderCapacityPerResource,
               xy,
               gs,
               getInputMode(building, gs),
               transportSourceCache,
            );
         });
      }
      if (building.status === "stacking" && isWorldWonder(building.type)) {
         OnBuildingProductionComplete.emit({ xy, offline });
      }
      if (maxCompleted) {
         // QuickPath aka Shortcut
         building.stack = building.desiredStack;
         forEach(maxCost, (res, amount) => {
            if (GLOBAL_PARAMS.DEBUG_STACKING) {
               addSystemMessage(
                  `Processing Stacking.maxComplete for res ${res} with needed ${formatNumber(amount)}`,
               );
            }
            safeAdd(building.resources, res, -amount);
         });
         building.suspendedInput.clear();
         OnBuildingOrUpgradeComplete.emit(xy);
         if (building.status === "stacking" && building.stack >= building.desiredStack) {
            building.status = "completed";
         }
      } else if (completed) {
         building.stack++;
         forEach(cost, (res, amount) => {
            if (GLOBAL_PARAMS.DEBUG_STACKING) {
               addSystemMessage(
                  `Processing Stacking.Complete for res ${res} with needed ${formatNumber(amount)}`,
               );
            }
            safeAdd(building.resources, res, -amount);
         });
         building.suspendedInput.clear();
         OnBuildingOrUpgradeComplete.emit(xy);
         if (building.status === "stacking" && building.stack >= building.desiredStack) {
            building.status = "completed";
         }
      }
      return;
   }

   if (gs.unlockedTech.Banking && building.level >= 10) {
      mapSafePush(Tick.next.tileMultipliers, xy, {
         storage: 1,
         source: t(L.SourceResearch, { tech: t(L.Banking) }),
      });
   }

   // Modified by Lydia using match() function and range from Building
   const configBT = Config.Building[building.type];
   if (building.type.match("Caravansary")) {
      Tick.next.playerTradeBuildings.set(xy, building);
      const range = (configBT.range ?? 1) + GLOBAL_PARAMS.CARAVANSARIES_EXTRA_RANGE;
      if (hasFeature(GameFeature.WarehouseExtension, gs)) {
         for (const point of getGrid(gs).getRange(tileToPoint(xy), range)) {
            const nxy = pointToTile(point);
            const b = gs.tiles.get(nxy)?.building;
            if (b) {
               if (b.type.match("Warehouse") && b.status === "completed") {
                  Tick.next.playerTradeBuildings.set(nxy, b);
                  // adapted from lmc (liliannes modded client)
               } else if (GLOBAL_PARAMS.CARAVANSARIES_USE_EVERYTHING && !isSpecialBuilding(b.type)) {
                  Tick.next.playerTradeBuildings.set(nxy, b);
               }
            }
         }
      }
   }

   if ("resourceImports" in building) {
      const ri = building as IResourceImportBuildingData;
      if (hasFlag(ri.resourceImportOptions, ResourceImportOptions.ManagedImport)) {
         const storage = getStorageFor(xy, gs);
         const totalCapacity = getResourceImportCapacity(
            ri,
            totalLevelBoostFor(xy),
            (configBT.importCapacity ?? 1) * totalMultiplierFor(xy, "output", 1, false, gs),
         );

         const result = new Map<Resource, number>();
         let total = 0;
         for (const point of getGrid(gs).getRange(tileToPoint(xy), MANAGED_IMPORT_RANGE)) {
            const nxy = pointToTile(point);
            const b = getWorkingBuilding(nxy, gs);
            if (!b) continue;
            forEach(
               filterTransportable(getBuildingIO(nxy, "output", IOFlags.Capacity | IOFlags.Multiplier, gs)),
               (res, value) => {
                  mapSafeAdd(result, res, value);
                  total += value;
               },
            );
         }
         if (total > 0) {
            const averageStorage = storage.total / total;
            const averageCapacity = totalCapacity / total;
            ri.resourceImports = {};
            result.forEach((value, res) => {
               ri.resourceImports[res] = {
                  perCycle: Math.floor(averageCapacity * value),
                  cap: Math.floor(averageStorage * value),
               };
            });
         }
      }
   }

   // Tick.current.totalValue > 0 here is to check whether the tick is ready! Otherwise we get a split second
   // of wrong number
   if (Tick.current.totalValue > 0 && total > 0) {
      Tick.next.storagePercentages.set(xy, used / total);
   }

   // Return early for buildings that are not working ////////////////////////////////////////////////////////
   if (!hasRequiredDeposit(Config.Building[building.type].deposit, xy, gs)) {
      Tick.next.notProducingReasons.set(xy, NotProducingReason.NotOnDeposit);
      return;
   }

   if (building.capacity <= 0) {
      Tick.next.notProducingReasons.set(xy, NotProducingReason.TurnedOff);
      return;
   }
   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   const input = filterTransportable(getBuildingIO(xy, "input", IOFlags.Multiplier | IOFlags.Capacity, gs));
   const worker = getWorkersFor(xy, gs);
   const inputWorkerCapacity = totalMultiplierFor(xy, "worker", 1, false, gs);

   //////////////////////////////////////////////////
   // Transport
   //////////////////////////////////////////////////

   let hasTransported = false;
   let totalInputAmount = 0;
   forEach(input, (res, amount) => {
      totalInputAmount += amount;
   });

   forEach(input, function forEachTransportResources(res, rawAmount) {
      let amount = rawAmount * getStockpileCapacity(building);
      // let maxAmount = getStockpileMax(building) * rawAmount;
      // Lydia: if getStockpileMax = Unlimited then adjust the limit per resource to the relativ importance of the resources -- e.g. LocomotiveFactory takes 1 engine and 10 steel -> totalInputAmount = 11
      let maxAmount = getStockpileMax(building) !== Number.POSITIVE_INFINITY ? (getStockpileMax(building) * rawAmount) : Math.round(rawAmount / totalInputAmount * total);

      if ("resourceImports" in building) {
         const ri = building as IResourceImportBuildingData;
         amount = rawAmount;
         maxAmount = ri.resourceImports[res]?.cap ?? 0;
      }

      if (amount <= 0) {
         return;
      }
      if (used + (isTransportable(res) ? amount : 0) > total) {
         return;
      }

      let availableAmount = building.resources[res] ?? 0;

      if (building.type === "CloneFactory") {
         const clone = building as ICloneBuildingData;
         availableAmount = Math.min(availableAmount, clone.transportedAmount);
      }

      if (availableAmount + getAmountInTransit(xy, res) > maxAmount) {
         return;
      }

      let inputMode = getInputMode(building, gs);

      if ("resourceImports" in building) {
         const rib = building as IResourceImportBuildingData;
         const ri = rib.resourceImports[res];
         if (ri && !isNullOrUndefined(ri.inputMode)) {
            inputMode = ri.inputMode;
         }
      }

      transportResource(res, amount, inputWorkerCapacity, xy, gs, inputMode, transportSourceCache);
      hasTransported = true;
   });

   // If a building is a resourceImport type but has not transported, we consider it not working
   if ("resourceImports" in building) {
      if (used >= total) {
         Tick.next.notProducingReasons.set(xy, NotProducingReason.StorageFull);
      } else if (!hasTransported) {
         Tick.next.notProducingReasons.set(xy, NotProducingReason.NoActiveTransports);
      }
   }

   //////////////////////////////////////////////////
   // Production
   //////////////////////////////////////////////////

   if (building.type === "Market") {
      const market = building as IMarketBuildingData;
      let totalBought = 0;
      forEach(market.sellResources, function marketProduction(sellResource) {
         const buyResource = market.availableResources[sellResource];
         if (!buyResource) {
            delete market.sellResources[sellResource];
            return;
         }
         const sellAmount = clamp(
            building.capacity * getMarketSellAmount(sellResource, xy, gs),
            0,
            building.resources[sellResource] ?? 0,
         );
         const buyAmount = getMarketBuyAmount(sellResource, sellAmount, buyResource, xy, gs);
         if (used - sellAmount + buyAmount > total) {
            Tick.next.notProducingReasons.set(xy, NotProducingReason.StorageFull);
            return;
         }
         safeAdd(building.resources, sellResource, -sellAmount);
         result.push({ xy, resource: buyResource, amount: buyAmount });
         // safeAdd(building.resources, buyResource, buyAmount);
         totalBought += buyAmount;
      });
      if (totalBought > 0) {
         RequestFloater.emit({ xy, amount: totalBought });
         OnBuildingProductionComplete.emit({ xy, offline });
      }
      return;
   }

   if ("resourceImports" in building) {
      if (hasFeature(GameFeature.WarehouseUpgrade, gs) && "warehouseOptions" in building) {
         const warehouse = building as IWarehouseBuildingData;
         if (hasFlag(warehouse.warehouseOptions, WarehouseOptions.Autopilot)) {
            tickWarehouseAutopilot(warehouse, xy, transportSourceCache, gs);
         }
      }
      return;
   }

   if (building.type === "CloneFactory") {
      const clone = building as ICloneBuildingData;
      const requiredAmount = input[clone.inputResource] ?? 0;
      const transportedAmount = Math.min(
         clone.transportedAmount,
         building.resources[clone.inputResource] ?? 0,
      );
      if (transportedAmount < requiredAmount) {
         Tick.next.notProducingReasons.set(xy, NotProducingReason.NotEnoughResources);
         return;
      }
      clone.transportedAmount -= requiredAmount;
   }

   ////////// Power
   const requiresPower = Config.Building[building.type].power;
   const hasPower = !requiresPower || Tick.current.powerGrid.has(xy);
   if (!hasPower) {
      Tick.next.notProducingReasons.set(xy, NotProducingReason.NoPower);
      return;
   }
   if (requiresPower) {
      Tick.next.powerBuildings.add(xy);
   }

   ////////// Worker
   const hasEnoughWorker = getAvailableWorkers("Worker") >= worker.output;
   if (!hasEnoughWorker) {
      Tick.next.notProducingReasons.set(xy, NotProducingReason.NotEnoughWorkers);
      return;
   }

   ////////// Input
   const hasEnoughInput = hasEnoughResources(building.resources, input);
   if (!hasEnoughInput) {
      Tick.next.notProducingReasons.set(xy, NotProducingReason.NotEnoughResources);
      return;
   }

   ////////// Storage + Partial Production (when storage is full)
   // 2025.8.12: We skip storage check for Headquarter. This is due to a bug that can cause Headquarter to
   // have some random resources. The bug has been fixed but some players might still have bad save files.
   // Bugfix: https://github.com/fishpondstudio/CivIdle/commit/0b1d5623c3756056f2ebee87290ed5728a8996e9#diff-9035467b2d27a7d3e12912f854e205363860aae7c38dfac1695e23fadab17499R43
   const skipStorageCheck = isEmpty(output) || building.type === "Headquarter";
   const hasEnoughStorage =
      skipStorageCheck ||
      used + getStorageRequired(output) + getStorageRequired(input) * getStockpileCapacity(building) <= total;
   if (!hasEnoughStorage) {
      const nonTransportables = filterNonTransportable(output);
      if (sizeOf(nonTransportables) > 0) {
         const worker = getWorkersFor(xy, gs);
         useWorkers("Worker", worker.output, xy);
         deductResources(building.resources, input);
         forEach(nonTransportables, (res, amount) => {
            const storage = Tick.current.specialBuildings.get("Headquarter")?.building.resources;
            switch (res) {
               case "Science": {
                  if (storage) {
                     RequestFloater.emit({ xy, amount });
                     // result.push({ xy, resource: res, amount });
                     safeAdd(storage, res, amount);
                     Tick.next.scienceProduced.set(xy, amount);
                  }
                  break;
               }
               case "Pollution": {
                  if (storage) {
                     RequestFloater.emit({ xy, amount });
                     safeAdd(storage, res, amount);
                     Tick.next.pollutionProduced.set(xy, amount);
                  }
                  break;
               }
               case "Power": {
                  Tick.next.powerPlants.add(xy);
                  break;
               }
            }
            mapSafeAdd(Tick.next.workersAvailable, res, amount);
         });
         if (!isEmpty(filterTransportable(output))) {
            Tick.next.notProducingReasons.set(xy, NotProducingReason.StorageFull);
         }
      } else {
         Tick.next.notProducingReasons.set(xy, NotProducingReason.StorageFull);
      }
      return;
   }

   ////////// Electrification
   if (hasFeature(GameFeature.Electricity, gs) && canBeElectrified(building.type)) {
      const requiredPower = getPowerRequired(building, gs);
      if (getAvailableWorkers("Power") >= requiredPower) {
         useWorkers("Power", requiredPower, xy);
         Tick.next.electrified.set(xy, getElectrificationLevel(building, gs));
      } else if (requiredPower > 0) {
         Tick.next.notEnoughPower.add(xy);
      }
      if (Config.Building[building.type].power) {
         mapSafePush(Tick.next.levelBoost, xy, { value: 5, source: t(L.PoweredBuilding) });
      }
      if (gs.unlockedUpgrades.Liberalism5) {
         mapSafePush(Tick.next.levelBoost, xy, { value: 5, source: Config.Upgrade.Liberalism5.name() });
      }
   }

   // Lydia: this is needed to get levelBoost effects from Wonders and GreatPeople working
   const totalLevelBoost = totalMultiplierFor(xy, "levelBoost", 1, false, gs);
   if (totalLevelBoost > 0) {
      getMultipliersFor(xy, false, gs).map((m2, idx) => {
         if (!m2.levelBoost) {
            return null;
         }
         mapSafePush(Tick.next.levelBoost, xy, { value: m2.levelBoost, source: m2.source });
      });
   }

   ////////// Production (when storage is NOT full)
   useWorkers("Worker", worker.output, xy);
   deductResources(building.resources, input);
   forEach(output, (res, amount) => {
      if (isTransportable(res)) {
         result.push({ xy, resource: res, amount });
         // safeAdd(building.resources, res, amount);
         RequestFloater.emit({ xy, amount });
         return;
      }
      // Lydia: identical code as in "if (!hasEnoughStorage) {"
      const storage = Tick.current.specialBuildings.get("Headquarter")?.building.resources;
      switch (res) {
         case "Science": {
            if (storage) {
               RequestFloater.emit({ xy, amount });
               // result.push({ xy, resource: res, amount });
               safeAdd(storage, res, amount);
               Tick.next.scienceProduced.set(xy, amount);
            }
            break;
         }
         case "Pollution": {
            if (storage) {
               RequestFloater.emit({ xy, amount });
               safeAdd(storage, res, amount);
               Tick.next.pollutionProduced.set(xy, amount);
            }
            break;
         }
         case "Power": {
            Tick.next.powerPlants.add(xy);
            break;
         }
      }
      mapSafeAdd(Tick.next.workersAvailable, res, amount);
   });
   OnBuildingProductionComplete.emit({ xy, offline });
}

function tickWarehouseAutopilot(
   warehouse: IWarehouseBuildingData,
   xy: Tile,
   transportSourceCache: boolean,
   gs: GameState,
): void {
   let capacity = getResourceImportIdleCapacity(xy, gs);
   if (capacity <= 0) {
      return;
   }
   const workerCapacity = totalMultiplierFor(xy, "worker", 1, false, gs);
   const transportCapacity =
      workerCapacity +
      Tick.current.globalMultipliers.transportCapacity.reduce((prev, curr) => prev + curr.value, 0);

   // Not enough workers, capacity will be capped
   if (Math.ceil(capacity / transportCapacity) > getAvailableWorkers("Worker")) {
      capacity = getAvailableWorkers("Worker") * transportCapacity;
   }

   // Clamp capacity by available storage
   const { total, used } = getStorageFor(xy, gs);
   capacity = clamp(capacity, 0, total - used);

   if (capacity <= 0) {
      return;
   }

   const resourceFilter = new Set<Resource>();
   if (hasFlag(warehouse.warehouseOptions, WarehouseOptions.AutopilotRespectCap)) {
      forEach(warehouse.resourceImports, (res, ri) => {
         if ((warehouse.resources[res] ?? 0) < ri.cap) {
            resourceFilter.add(res);
         } else {
            resourceFilter.delete(res);
         }
      });
   }

   const result = getStorageFullBuildings().sort(
      (a, b) => getGrid(gs).distanceTile(a, xy) - getGrid(gs).distanceTile(b, xy),
   );

   for (const tile of result) {
      const building = gs.tiles.get(tile)?.building;
      if (!building || tile === xy) {
         continue;
      }
      const output = getBuildingIO(tile, "output", IOFlags.None, gs);
      const candidates = keysOf(building.resources)
         .filter((r) => {
            if (hasFlag(warehouse.warehouseOptions, WarehouseOptions.AutopilotRespectCap)) {
               return resourceFilter.has(r) && output[r];
            }
            return output[r];
         })
         .sort((a, b) => (building.resources[b] ?? 0) - (building.resources[a] ?? 0));
      for (const res of candidates) {
         const capacityLeft = transportResource(
            res,
            capacity,
            workerCapacity,
            xy,
            gs,
            BuildingInputMode.Distance,
            transportSourceCache,
            [tile],
         );
         if (capacityLeft < capacity) {
            Tick.next.notProducingReasons.delete(xy);
         }
         capacity = capacityLeft;
         if (capacity <= 0) {
            return;
         }
      }
   }
}

export type TileAndRes = number;

export function hashTileAndRes(xy: Tile, res: Resource): TileAndRes {
   return (tileToHash(xy) << 12) | Config.ResourceHash[res]!;
}

const _transportSourceCache = new Map<TileAndRes, Tile[]>();

export function clearTransportSourceCache(): void {
   _transportSourceCache.clear();
}

export function transportResource(
   res: Resource,
   amount: number,
   workerCapacity: number,
   targetXy: Tile,
   gs: GameState,
   mode: BuildingInputMode,
   transportSourceCache: boolean,
   sourcesOverride: Tile[] | undefined = undefined,
): number {
   let amountLeft = amount;
   const grid = getGrid(gs);
   const targetPoint = tileToPoint(targetXy);
   // We are out of workers, no need to run the expensive sorting!
   if (getAvailableWorkers("Worker") <= 0) {
      return amountLeft;
   }

   const targetBuilding = gs.tiles.get(targetXy)?.building;
   if (!targetBuilding) {
      return amountLeft;
   }
   // This cache needs to be cleared when:
   // 1) Building has changed (add, remove and move)
   // 2) [THIS IS NO LONGER TRUE] ~Building's max input distance has changed~
   // Also, we can only cache Distance Input Mode. We cannot cache Warehouse (due to Managed Mode)
   const cacheKey =
      transportSourceCache && mode === BuildingInputMode.Distance && !("resourceImports" in targetBuilding)
         ? hashTileAndRes(targetXy, res)
         : null;

   let sources: Tile[] | undefined;

   if (sourcesOverride) {
      sources = sourcesOverride;
   }

   if (!sources && cacheKey) {
      sources = _transportSourceCache.get(cacheKey);
   }

   if (!sources) {
      const candidates = Tick.current.resourcesByTile.get(res)?.slice() ?? [];
      // We need to add all Warehouse/Caravansary here, because it is excluded from `resourcesByTile`
      Tick.current.resourceImportBuildings.forEach((b, xy) => {
         candidates.push({
            tile: xy,
            amount: b.building.resources[res] ?? 0,
            usedStoragePercentage: b.usedStoragePercentage,
         });
      });

      candidates.sort((point1, point2) => {
         switch (mode) {
            case BuildingInputMode.Distance:
               return grid.distanceTile(point1.tile, targetXy) - grid.distanceTile(point2.tile, targetXy);
            case BuildingInputMode.Amount:
               return point2.amount - point1.amount;
            case BuildingInputMode.StoragePercentage:
               return point2.usedStoragePercentage - point1.usedStoragePercentage;
         }
      });

      sources = candidates.map((s) => s.tile);

      if (transportSourceCache && cacheKey && sources) {
         _transportSourceCache.set(cacheKey, sources);
      }
   }

   if (!sources) {
      return amountLeft;
   }

   for (let i = 0; i < sources.length; i++) {
      const from = sources[i];
      const sourceBuilding = gs.tiles.get(from)?.building;

      // Do all the filtering logic here (after cache), so that cache always have the most complete list)
      if (!sourceBuilding || sourceBuilding.status !== "completed" || from === targetXy) {
         continue;
      }
      if (
         targetBuilding?.type === "CloneFactory" &&
         targetBuilding?.status === "completed" &&
         !Config.Building[sourceBuilding.type].output[res]
      ) {
         continue;
      }

      if (sourceBuilding.type === "SwissBank") {
         const swissBank = sourceBuilding as ISwissBankBuildingData;
         if (hasFlag(swissBank.flags, SwissBankFlags.NoExport)) {
            continue;
         }
      }

      const maxDistance = getMaxInputDistance(targetBuilding, gs);
      if (maxDistance !== Number.POSITIVE_INFINITY && grid.distanceTile(from, targetXy) > maxDistance) {
         continue;
      }

      const availableAmount = getAvailableResource(from, targetXy, res, gs);
      if (availableAmount <= 0) {
         continue;
      }

      let transportCapacity =
         workerCapacity +
         Tick.current.globalMultipliers.transportCapacity.reduce((prev, curr) => prev + curr.value, 0);

      const fromBuildingType = gs.tiles.get(from)?.building?.type;
      const toBuildingType = gs.tiles.get(targetXy)?.building?.type;

      if (fromBuildingType?.match("Warehouse") || toBuildingType?.match("Warehouse")) {
         if (gs.unlockedUpgrades.Liberalism3) {
            transportCapacity = Number.POSITIVE_INFINITY;
         } else if (hasFeature(GameFeature.WarehouseUpgrade, gs)) {
            const point = tileToPoint(from);
            const configBT = Config.Building[sourceBuilding.type];
            const distance = getGrid(gs).distance(point.x, point.y, targetPoint.x, targetPoint.y);
            if (distance <= (configBT.range ?? 1)) {
               transportCapacity = Number.POSITIVE_INFINITY;
            }
         }
      }

      const mah = Tick.current.specialBuildings.get("MausoleumAtHalicarnassus");
      if (mah && (grid.distanceTile(from, mah.tile) <= 2 || grid.distanceTile(targetXy, mah.tile) <= 2)) {
         transportCapacity = Number.POSITIVE_INFINITY;
      }

      let immediate = false;
      const festival = isFestival("SanchiStupa", gs);
      const range = festival ? 3 : 2;
      const sanchiStupa = Tick.current.specialBuildings.get("SanchiStupa");
      if (
         sanchiStupa &&
         (grid.distanceTile(from, sanchiStupa.tile) <= range ||
            grid.distanceTile(targetXy, sanchiStupa.tile) <= range)
      ) {
         immediate = true;
      }

      if (toBuildingType && Config.Building[toBuildingType].output.Worker) {
         transportCapacity = Number.POSITIVE_INFINITY;
      }

      if (availableAmount >= amountLeft) {
         const fuelAmount = Math.ceil(amountLeft / transportCapacity);
         const fuelLeft = getAvailableWorkers("Worker");
         if (fuelLeft >= fuelAmount) {
            sourceBuilding.resources[res]! -= amountLeft;
            addTransportation(res, amountLeft, "Worker", fuelAmount, from, targetXy, immediate, gs);
            amountLeft = 0;
         } else if (fuelLeft > 0) {
            const amountAfterFuel = (amountLeft * fuelLeft) / fuelAmount;
            sourceBuilding.resources[res]! -= amountAfterFuel;
            addTransportation(res, amountAfterFuel, "Worker", fuelLeft, from, targetXy, immediate, gs);
            amountLeft -= amountAfterFuel;
         }
         // Here we return because either we've got all we need, or we run out of workers (no need to continue)
         return amountLeft;
      }
      const amountToTransport = availableAmount!;
      const fuelAmount = Math.ceil(amountToTransport / transportCapacity);
      const fuelLeft = getAvailableWorkers("Worker");
      if (fuelLeft >= fuelAmount) {
         sourceBuilding.resources[res]! -= amountToTransport;
         addTransportation(res, amountToTransport, "Worker", fuelAmount, from, targetXy, immediate, gs);
         amountLeft -= amountToTransport;
         // We continue here because the next source might have what we need
      } else if (fuelLeft > 0) {
         const amountAfterFuel = (amountToTransport * fuelLeft) / fuelAmount;
         sourceBuilding.resources[res]! -= amountAfterFuel;
         addTransportation(res, amountAfterFuel, "Worker", fuelLeft, from, targetXy, immediate, gs);
         amountLeft -= amountAfterFuel;
         // We return here because we run out of workers (no need to continue)
         return amountLeft;
      }
   }
   return amountLeft;
}

export function addMultiplier(k: Building, multiplier: MultiplierWithStability, source: string) {
   let m = Tick.next.buildingMultipliers.get(k);
   if (m == null) {
      m = [];
   }
   m.push({ ...multiplier, source });
   Tick.next.buildingMultipliers.set(k, m);
}

function getPriceId() {
   return Math.floor(Date.now() / HOUR);
}

export function convertPriceIdToTime(priceId: number) {
   return priceId * HOUR;
}

export function tickPrice(gs: GameState) {
   const priceId = getPriceId();
   let forceUpdatePrice = false;
   if (gs.lastPriceUpdated !== priceId) {
      forceUpdatePrice = true;
      gs.lastPriceUpdated = priceId;
      OnPriceUpdated.emit(gs);
   }
   const resources = filterOf(unlockedResources(gs), (res) => !NoPrice[res] && !NoStorage[res]);
   const grandBazaar = findSpecialBuilding("GrandBazaar", gs);
   const grid = getGrid(gs);
   getBuildingsByType("Market", gs)?.forEach((tile, xy) => {
      const building = gs.tiles.get(xy)?.building;
      if (!building || building.type !== "Market") {
         return;
      }
      const market = building as IMarketBuildingData;
      if (forceUpdatePrice || sizeOf(market.availableResources) === 0) {
         const nextToGrandBazaar =
            grandBazaar?.building.status === "completed" && grid.distanceTile(grandBazaar.tile, xy) <= 1;
         const seed = nextToGrandBazaar ? `${priceId},${xy}` : `${priceId}`;
         const buy = shuffle(keysOf(resources), srand(seed));
         const sell = shuffle(keysOf(resources), srand(seed));
         market.availableResources = {};
         let idx = 0;
         for (const res of sell) {
            while (buy[idx % buy.length] === res) {
               idx++;
            }
            market.availableResources[res] = buy[idx % buy.length];
         }
         if (hasFlag(market.marketOptions, MarketOptions.ClearAfterUpdate)) {
            market.sellResources = {};
         } else {
            forEach(market.sellResources, (res) => {
               if (!market.availableResources[res]) {
                  delete market.sellResources[res];
               }
            });
         }
      }
   });
}

export interface IProduceResource {
   xy: Tile;
   resource: Resource;
   amount: number;
}
