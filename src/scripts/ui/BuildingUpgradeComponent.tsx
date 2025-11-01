import Tippy from "@tippyjs/react";
import { Fragment, useEffect, useState } from "react";
import type { Resource } from "../../../shared/definitions/ResourceDefinitions";
import {
   getDowngradeTargetLevels,
   getStackingTargetLevels,
   getTotalBuildingCost,
   getUpgradeTargetLevels,
   isSpecialBuilding,
} from "../../../shared/logic/BuildingLogic";
import { Config } from "../../../shared/logic/Config";
import { GLOBAL_PARAMS } from "../../../shared/logic/Constants";
import { notifyGameStateUpdate } from "../../../shared/logic/GameStateLogic";
import { clearIntraTickCache, getGrid } from "../../../shared/logic/IntraTickCache";
import { RequestResetTile } from "../../../shared/logic/TechLogic";
import { NotProducingReason, Tick } from "../../../shared/logic/TickLogic";
import type { IBuildingData } from "../../../shared/logic/Tile";
import { clearTransportSourceCache } from "../../../shared/logic/Update";
import {
   formatNumber,
   keysOf,
   mapOf,
   numberToRoman,
   pointToTile,
   safeAdd,
   tileToPoint,
   type Tile,
} from "../../../shared/utilities/Helper";
import type { PartialTabulate } from "../../../shared/utilities/TypeDefinitions";
import { L, t } from "../../../shared/utilities/i18n";
import { WorldScene } from "../scenes/WorldScene";
import { useShortcut } from "../utilities/Hook";
import { Singleton } from "../utilities/Singleton";
import { playClick, playError, playSuccess } from "../visuals/Sound";
import type { IBuildingComponentProps } from "./BuildingPage";
import { hideToast, showToast } from "./GlobalModal";

//export type UpgradeState = "all" | "active" | "disabled";

export function BuildingUpgradeComponent({ gameState, xy }: IBuildingComponentProps): React.ReactNode {
   const tile = gameState.tiles.get(xy);
   const building = tile?.building;
   if (!building) {
      return null;
   }
   const configBT = Config.Building[building.type];
   if ((configBT?.max ?? Number.POSITIVE_INFINITY) <= 1) {
      if (configBT.special != null && !(GLOBAL_PARAMS.WONDER_STACKING && configBT.special === 1)) {
         return null;
      }
   }
   const [upgradeState, setUpgradeState] = useState<string>("0");
   const [upgradeRange, setUpgradeRange] = useState<string>("0");
   const [selected, setSelected] = useState(new Set([xy]));
   const levels = getUpgradeTargetLevels(building);
   const levelsDown = getDowngradeTargetLevels(building);
   const stacks = getStackingTargetLevels(building);
   const upgradeTo = (targetLevel: number) => {
      selected.forEach((xy) => {
         const b = gameState.tiles.get(xy)?.building;
         if (!b) return;
         const target = targetLevel < 0 ? b.level + Math.abs(targetLevel) : targetLevel;
         if ((!isSpecialBuilding(b.type) || (GLOBAL_PARAMS.WONDER_STACKING && Config.Building[b.type].special === 1)) && target > b.level) {
            b.desiredLevel = target;
            b.status = "upgrading";
         }
      });
      setSelected(new Set([xy]));
      Singleton().sceneManager.getCurrent(WorldScene)?.drawSelection(null, Array.from(selected));
      notifyGameStateUpdate();
   };
   useShortcut("BuildingPageUpgrade1", () => upgradeTo(levels[0]), [xy]);
   useShortcut("BuildingPageUpgrade2", () => upgradeTo(levels[1]), [xy]);
   useShortcut("BuildingPageUpgrade3", () => upgradeTo(levels[2]), [xy]);
   useShortcut("BuildingPageUpgrade4", () => upgradeTo(levels[3]), [xy]);
   useShortcut("BuildingPageUpgrade5", () => upgradeTo(levels[4]), [xy]);
   const downgradeTo = (targetLevel: number) => {
      selected.forEach((xy) => {
         const b = gameState.tiles.get(xy)?.building;
         if (!b)
            return;
         const target = targetLevel < 0 ? b.level + targetLevel : targetLevel;
         if ((!isSpecialBuilding(b.type) || (GLOBAL_PARAMS.WONDER_STACKING && Config.Building[b.type].special === 1)) && target < b.level) {
            b.desiredLevel = target;
            b.status = "downgrading";
         }
      });
      setSelected(/* @__PURE__ */ new Set([xy]));
      Singleton().sceneManager.getCurrent(WorldScene)?.drawSelection(null, Array.from(selected));
      notifyGameStateUpdate();
   };
   const stackTo = (targetStack: number) => {
      selected.forEach((xy) => {
         const b = gameState.tiles.get(xy)?.building;
         if (!b)
            return;
         const target = targetStack < 0 ? b.stack + Math.abs(targetStack) : targetStack;
         if ((!isSpecialBuilding(b.type) || (GLOBAL_PARAMS.WONDER_STACKING && Config.Building[b.type].special === 1)) && target > b.stack) {
            b.desiredStack = target;
            b.status = "stacking";
         }
      });
      setSelected(/* @__PURE__ */ new Set([xy]));
      Singleton().sceneManager.getCurrent(WorldScene)?.drawSelection(null, Array.from(selected));
      notifyGameStateUpdate();
   };
   useEffect(() => {
      highlightUpgradeableBuildings(upgradeRange, upgradeState);
   }, [upgradeState, upgradeRange]);

   const age = Config.BuildingTechAge[building.type]!;

   const [moving, setMoving] = useState(false);
   const theMet = Tick.current.specialBuildings.get("TheMet");

   const selectRange = (range: number, sameType: boolean) => {
      const result = new Set<Tile>();
      getGrid(gameState)
         .getRange(tileToPoint(xy), range)
         .forEach((point) => {
            const xy = pointToTile(point);
            const tile = gameState.tiles.get(xy);
            if (
               tile?.building &&
               !isSpecialBuilding(tile.building.type) &&
               tile.building.status !== "building" &&
               (!sameType || tile.building.type === building.type) &&
               stateCondition(tile.building, xy)
            ) {
               result.add(xy);
            }
         });
      setSelected(result);
      Singleton().sceneManager.getCurrent(WorldScene)?.drawSelection(null, Array.from(result));
   };

   const buildCost = (idx: number, level: number) => {
      const resCost: PartialTabulate<Resource> = {};

      selected.forEach((xy) => {
         const b = gameState.tiles.get(xy)?.building;
         if (!b) return;
         mapOf(getTotalBuildingCost(b, b.level, idx === 0 ? b.level + 1 : level, b.stack), (res, amount) => {
            if (res in resCost) {
               resCost[res] = resCost[res]! + amount;
            } else {
               resCost[res] = amount;
            }
         });
      });

      return (
         <span>
            {idx === 0 ? `${t(L.Upgrade)} +1: ` : `${t(L.UpgradeTo, { level })}: `}
            {keysOf(resCost).map((item, idx) => {
               return (
                  <Fragment key={item}>
                     {idx === 0 ? "" : ", "}
                     <span
                        className={
                           (Tick.current.resourceAmount.get(item) ?? 0) < resCost[item]! ? "text-red" : ""
                        }
                     >
                        {Config.Resource[item].name()} {formatNumber(resCost[item])}
                     </span>
                  </Fragment>
               );
            })}
         </span>
      );
   };

   // Added by Lydia
   const downgradeHint = (idx: number, level: number) => {
      return (
         <span>
            {idx === 0 ? `${t(L.Downgrade)} -1: ` : `${t(L.DowngradeTo, { level })}: `}
         </span>
      );
   };
   const stackCost = (idx: number, stack: number) => {
      const resCost: PartialTabulate<Resource> = {};
      selected.forEach((xy) => {
         const b = gameState.tiles.get(xy)?.building;
         if (!b) return;
         const newStack = idx === 0 ? b.stack + 1 : stack;
         // similar to "stacking" section I here need to calculate differently with fullCost - prevCost
         mapOf(getTotalBuildingCost(b, 0, b.level, newStack), (res, amount) => {
            if (resCost[res]) {
               resCost[res] += amount;
            } else {
               resCost[res] = amount;
            }
         });
         mapOf(getTotalBuildingCost(b, 0, b.level, b.stack), (res, amount) => {
            if (resCost[res]) {
               resCost[res] -= amount;
            } else {
               resCost[res] = -amount;
            }
         });
      });

      return (
         <span>
            {idx === 0 ? `${t(L.Stack)} +1: ` : `${t(L.StackTo, { stack })}: `}
            {keysOf(resCost).map((item, idx) => {
               return (
                  <Fragment key={item}>
                     {idx === 0 ? "" : ", "}
                     <span
                        className={
                           (Tick.current.resourceAmount.get(item) ?? 0) < resCost[item]! ? "text-red" : ""
                        }
                     >
                        {Config.Resource[item].name()} {formatNumber(resCost[item])}
                     </span>
                  </Fragment>
               );
            })}
         </span>
      );
   };

   const stateCondition = (b: IBuildingData, xy: Tile) => {
      switch (upgradeState) {
         case "0": // All buildings
            return true;
         case "1": //  Active buildings
            return b.capacity > 0;
         case "2": // Turned off buildings
            return b.capacity === 0;
         case "3": // Buildings that have full storage
            return Tick.current.notProducingReasons.get(xy) === NotProducingReason.StorageFull;
      }
   };

   const highlightUpgradeableBuildings = (upgradeRange: string, upgradeState: string) => {
      switch (upgradeRange) {
         case "0": {
            if (stateCondition(building, xy)) {
               setSelected(new Set([xy]));
               Singleton().sceneManager.getCurrent(WorldScene)?.drawSelection(null, []);
            }
            break;
         }
         case "1": {
            const result = new Set<Tile>();
            gameState.tiles.forEach((tile, xy) => {
               if (
                  tile?.building?.type === building.type &&
                  tile.building.status !== "building" &&
                  stateCondition(tile.building, xy)
               ) {
                  result.add(xy);
               }
            });
            setSelected(result);
            Singleton().sceneManager.getCurrent(WorldScene)?.drawSelection(null, Array.from(result));
            break;
         }
         case "2": {
            const result = new Set<Tile>();
            gameState.tiles.forEach((tile, xy) => {
               if (
                  tile?.building?.type === building.type &&
                  tile.building.status !== "building" &&
                  tile.building.level === building.level &&
                  stateCondition(tile.building, xy)
               ) {
                  result.add(xy);
               }
            });
            setSelected(result);
            Singleton().sceneManager.getCurrent(WorldScene)?.drawSelection(null, Array.from(result));
            break;
         }
         case "3":
            selectRange(1, true);
            break;
         case "4":
            selectRange(2, true);
            break;
         case "5":
            selectRange(3, true);
            break;
         case "6":
            selectRange(1, false);
            break;
         case "7":
            selectRange(2, false);
            break;
         case "8":
            selectRange(3, false);
            break;
      }
   };

   return (
      <>
         <fieldset>
            <div className="row">
               <div className="f1 text-center">
                  <div className="text-strong text-large">{building.level}</div>
                  <div className="text-small text-desc">{t(L.Level)}</div>
               </div>
               {GLOBAL_PARAMS.SHOW_STACKING && building.stack > 1 ? (
                  <div className="f1 text-center">
                     <div className="text-strong text-large">{building.stack}</div>
                     <div className="text-small text-desc">{t(L.Stack)}</div>
                  </div>
               ) : null}
               {Config.BuildingTier[building.type] ? (
                  <div className="f1 text-center">
                     <div className="text-strong text-large">
                        {numberToRoman(Config.BuildingTier[building.type]!)}
                     </div>
                     <div className="text-small text-desc">{t(L.BuildingTier)}</div>
                  </div>
               ) : null}
               {Config.TechAge[age] ? (
                  <Tippy content={Config.TechAge[age].name()}>
                     <div className="f1 text-center">
                        <div className="text-strong text-large">
                           {numberToRoman(Config.TechAge[age].idx + 1)}
                        </div>
                        <div className="text-small text-desc">{t(L.TechAge)}</div>
                     </div>
                  </Tippy>
               ) : null}
            </div>
            <div className="separator" />
            <div className="row text-small text-strong">
               <Tippy content={t(L.BatchModeTooltip, { count: selected.size })}>
                  <div>
                     {t(L.BatchUpgrade)}: {selected.size}
                  </div>
               </Tippy>
               <div className="f1"></div>
               <select
                  className="condensed mr5"
                  defaultValue={0}
                  onChange={(e) => {
                     setUpgradeState(e.target.value);
                  }}
               >
                  <option value={0}>{t(L.BatchStateSelectAll)}</option>
                  <option value={1}>{t(L.BatchStateSelectActive)}</option>
                  <option value={2}>{t(L.BatchStateSelectTurnedOff)}</option>
                  <option value={3}>{t(L.BatchStateSelectTurnedFullStorage)}</option>
               </select>
               <select
                  style={{ margin: "-10px 0" }}
                  className="condensed"
                  defaultValue={0}
                  onChange={(e) => {
                     setUpgradeRange(e.target.value);
                  }}
               >
                  <option value={0}>{t(L.BatchSelectThisBuilding)}</option>
                  <option value={1}>{t(L.BatchSelectAllSameType)}</option>
                  <option value={2}>{t(L.BatchSelectSameTypeSameLevel)}</option>
                  <option value={3}>{t(L.BatchSelectSameType1Tile)}</option>
                  <option value={4}>{t(L.BatchSelectSameType2Tile)}</option>
                  <option value={5}>{t(L.BatchSelectSameType3Tile)}</option>
                  <option value={6}>{t(L.BatchSelectAnyType1Tile)}</option>
                  <option value={7}>{t(L.BatchSelectAnyType2Tile)}</option>
                  <option value={8}>{t(L.BatchSelectAnyType3Tile)}</option>
               </select>
            </div>
            <div className="separator" />
            <div className="row">
               {levels.map((level, idx) => (
                  <Tippy key={idx} content={buildCost(idx, level)}>
                     <button className="f1" onClick={() => upgradeTo(idx === 0 ? -1 : level)}>
                        {idx === 0 ? "+1" : `${level}`}
                     </button>
                  </Tippy>
               ))}
            </div>

            {GLOBAL_PARAMS.SHOW_DOWNGRADING ? (
               <div className="row">
                  {levelsDown.map((level, idx) => (
                     <Tippy key={idx} content={downgradeHint(idx, level)}>
                        <button className="f1" onClick={() => downgradeTo(idx === 0 ? -1 : level)}>
                           {idx === 0 ? "-1" : `${level}`}
                        </button>
                     </Tippy>
                  ))}
               </div>
            ) : null}

            {GLOBAL_PARAMS.SHOW_STACKING && GLOBAL_PARAMS.USE_STACKING ? (
               <div className="separator" />
            ) : null}
            {GLOBAL_PARAMS.SHOW_STACKING && GLOBAL_PARAMS.USE_STACKING ? (
               <div className="row">
                  {stacks.map((stack, idx) => (
                     <Tippy key={idx} content={stackCost(idx, stack)}>
                        <button className="f1" onClick={() => stackTo(idx === 0 ? -1 : stack)}>
                           {idx === 0 ? "+1" : `${stack}`}
                        </button>
                     </Tippy>
                  ))}
               </div>
            ) : null}

            {theMet ? (
               <button
                  className="row w100 jcc mt5"
                  disabled={moving || (theMet.building.resources.Teleport ?? 0) <= 0}
                  onClick={async () => {
                     playClick();
                     showToast(t(L.MoveBuildingSelectTileToastHTML), 10000000);
                     setMoving(true);
                     const point = await Singleton().sceneManager.getCurrent(WorldScene)?.hijackSelectGrid();
                     hideToast();
                     setMoving(false);
                     if (!point || moving || (theMet.building.resources.Teleport ?? 0) <= 0) {
                        playError();
                        return;
                     }
                     const xy = pointToTile(point);
                     const newTile = gameState.tiles.get(xy);
                     if (newTile && !newTile.building && newTile.explored) {
                        playSuccess();
                        newTile.building = building;
                        safeAdd(theMet.building.resources, "Teleport", -1);
                        delete tile.building;
                        RequestResetTile.emit(tile.tile);
                        RequestResetTile.emit(newTile.tile);
                        notifyGameStateUpdate();
                        clearTransportSourceCache();
                        clearIntraTickCache();
                        Singleton().sceneManager.getCurrent(WorldScene)?.selectGrid(point);
                     } else {
                        showToast(L.MoveBuildingFail);
                        playError();
                     }
                  }}
               >
                  <div className="m-icon small">zoom_out_map</div>
                  <Tippy
                     content={t(L.MoveBuildingNoTeleport)}
                     disabled={(theMet.building.resources.Teleport ?? 0) > 0}
                  >
                     <div className="f1">{moving ? t(L.MoveBuildingSelectTile) : t(L.MoveBuilding)}</div>
                  </Tippy>
               </button>
            ) : null}
         </fieldset>
      </>
   );
}
