import Tippy from "@tippyjs/react";
import classNames from "classnames";
import { IOFlags, getMultipliersFor, totalMultiplierFor } from "../../../shared/logic/BuildingLogic";
import { Config } from "../../../shared/logic/Config";
import { GLOBAL_PARAMS } from "../../../shared/logic/Constants";
import type { GameState } from "../../../shared/logic/GameState";
import { getBuildingIO, getCloneLabScienceOutput } from "../../../shared/logic/IntraTickCache";
import { NotProducingReason, Tick } from "../../../shared/logic/TickLogic";
import type { ICloneBuildingData } from "../../../shared/logic/Tile";
import { formatNumber, type Tile } from "../../../shared/utilities/Helper";
import { $t, L } from "../../../shared/utilities/i18n";
import warning from "../../images/warning.png";
import { jsxMapOf } from "../utilities/Helper";
import { FormatNumber } from "./HelperComponents";
import { TextWithHelp } from "./TextWithHelpComponent";

export function BuildingIOTreeViewComponent({
   gameState,
   xy,
   type,
}: {
   gameState: GameState;
   xy: Tile;
   type: "input" | "output";
}): React.ReactNode {
   const data = getBuildingIO(xy, type, IOFlags.Multiplier | IOFlags.Capacity, gameState);
   const building = gameState.tiles.get(xy)?.building;
   if (!building) {
      return null;
   }
   const buildingType = building?.type;
   const configBT = Config.Building[building.type];
   const configBTInputMultiplier = configBT.inputMultiplier ?? 0;
   const totalMultiplier = type === "input" ? (configBTInputMultiplier > 0 ? 1 + totalMultiplierFor(xy, "output", 0, false, gameState) * configBTInputMultiplier : 1) : totalMultiplierFor(xy, type, 1, false, gameState);
   const isCloneOutput =
      type === "output" && (buildingType === "CloneFactory" || buildingType === "CloneLab");
   const levelBoost = Tick.current.levelBoost.get(xy) ?? [];
   return (
      <ul className="tree-view">
         {jsxMapOf(data, (k, v) => {
            const resourceInStorage = gameState.tiles.get(xy)?.building?.resources[k] ?? 0;
            const showWarning =
               type === "input" &&
               Tick.current.notProducingReasons.get(xy) === NotProducingReason.NotEnoughResources &&
               resourceInStorage < v;
            const electrificationLevel = Tick.current.electrified.get(xy) ?? 0;
            let baseValue = buildingType ? (Config.Building[buildingType][type][k] ?? 0) : 0;
            if (buildingType === "CloneFactory") {
               baseValue = 1;
            }
            if (building && "inputResource" in building && buildingType === "CloneLab") {
               const clone = building as ICloneBuildingData;
               baseValue = type === "input" ? 1 : getCloneLabScienceOutput(clone) / 2;
            }
            if (building && "recycleInput" in building && buildingType?.match("Recycling")) {
               baseValue = 1;
            }
            return (
               <li key={k}>
                  <details>
                     <summary className="row">
                        {showWarning ? <img src={warning} style={{ margin: "0 2px 0 0" }} /> : null}
                        <div className={classNames({ f1: true, "production-warning": showWarning })}>
                           {Config.Material[k].name()}
                        </div>
                        <div className="text-strong">
                           <FormatNumber value={v} />
                        </div>
                     </summary>
                     <ul>
                        {isCloneOutput ? (
                           <li className="row text-strong">
                              <TextWithHelp content={$t(L.ResourceCloneTooltip)}>
                                 <div>{$t(L.InputResourceForCloning)}</div>
                              </TextWithHelp>
                              <div className="f1 text-right">
                                 <FormatNumber value={v / (1 + totalMultiplier)} />
                              </div>
                           </li>
                        ) : null}
                        <li className="row">
                           <div className="f1">{$t(L.IntrinsicRatio)}</div>
                           <div className="text-strong">x{formatNumber(baseValue)}</div>
                        </li>
                        { GLOBAL_PARAMS.SHOW_STACKING && building.stack > 1 ? (
                           <li className="row">
                              <div className="f1">{$t(L.Stack)}</div>
                              <div className="text-strong">x{formatNumber(building.stack)}</div>
                           </li>
                        ) : null}
                        <li className="row">
                           <div className="f1">
                              {type === "input" ? $t(L.BaseConsumption) : $t(L.BaseProduction)}
                           </div>
                           <div className="text-strong">
                              <FormatNumber
                                 value={
                                    v / (isCloneOutput ? 1 + totalMultiplier : totalMultiplier) / baseValue / building.stack
                                 }
                              />
                           </div>
                        </li>
                        <ul className="text-small">
                           <li className="row">
                              <div className="f1">{$t(L.BuildingLevel)}</div>
                              <FormatNumber value={building?.level ?? 0} />
                           </li>
                           {building && electrificationLevel > 0 ? (
                              <li className="row">
                                 <div className="f1">{$t(L.ElectrificationLevel)}</div>
                                 <FormatNumber value={electrificationLevel} />
                              </li>
                           ) : null}
                           {levelBoost && levelBoost.length > 0
                              ? levelBoost.map((lb, idx) => (
                                 <li key={idx} className="row">
                                    <div className="f1">{lb.source}</div>
                                    <FormatNumber value={lb.value} />
                                 </li>
                              ))
                              : null}
                        </ul>
                        {type === "output" || totalMultiplier > 1 ? (
                           <>
                              <li className="row">
                                 <div className="f1">{$t(L.ProductionMultiplier)}</div>
                                 <div className="text-strong">
                                    x
                                    <FormatNumber value={totalMultiplier} />
                                 </div>
                              </li>
                              <ul className="text-small">
                                 <li className="row">
                                    <div className="f1">{$t(L.BaseMultiplier)}</div>
                                    <div>1</div>
                                 </li>
                                 {getMultipliersFor(xy, false, gameState).map((m, idx) => {
                                    if (!m.output) {
                                       return null;
                                    }
                                    return (
                                       <li key={idx} className="row">
                                          <div>{m.source}</div>
                                          {m.unstable ? (
                                             <Tippy content={$t(L.DynamicMultiplierTooltip)}>
                                                <div className="m-icon small ml5 text-desc">whatshot</div>
                                             </Tippy>
                                          ) : null}
                                          <div className="f1 text-right">
                                             <FormatNumber value={m.output * (type === "input" ? configBTInputMultiplier : 1)} />
                                          </div>
                                       </li>
                                    );
                                 })}
                              </ul>
                           </>
                        ) : null}
                     </ul>
                  </details>
               </li>
            );
         })}
      </ul>
   );
}
