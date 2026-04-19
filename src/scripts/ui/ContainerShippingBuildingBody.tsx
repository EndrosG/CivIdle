import type React from "react";
import { Config } from "../../../shared/logic/Config";
import { getGameOptions } from "../../../shared/logic/GameStateLogic";
import { $t, L } from "../../../shared/utilities/i18n";
import { jsxMapOf } from "../utilities/Helper";
import { BuildingColorComponent } from "./BuildingColorComponent";
import { BuildingConsumeComponent } from "./BuildingConsumeComponent";
import { BuildingDescriptionComponent } from "./BuildingDescriptionComponent";
import { BuildingElectricityComponent } from "./BuildingElectricityComponent";
import { BuildingMoveComponent } from "./BuildingMoveComponent";
import type { IBuildingComponentProps } from "./BuildingPage";
import { BuildingStorageComponent } from "./BuildingStorageComponent";
import { BuildingValueComponent } from "./BuildingValueComponent";
import { BuildingWikipediaComponent } from "./BuildingWikipediaComponent";

export function ContainerShippingBuildingBody({ gameState, xy }: IBuildingComponentProps): React.ReactNode {
   const building = gameState.tiles.get(xy)?.building;
   if (!building) {
      return null;
   }
   return (
      <div className="window-body">
         <BuildingDescriptionComponent gameState={gameState} xy={xy} />
         <div className="table-view mv10">
            <table>
               {jsxMapOf(Config.Building, (btype, def) => {
                  return (
                     btype !== "ContainerPort" && btype.match("ContainerPort") ?
                     <tr key={btype}>
                        <td className="f1">{$t(L.ContainerRoute, { portName: Config.Building[btype].name()})}</td>
                        <td className="small text-right text-green">
                           {getGameOptions().maxBuildingLevels[btype] ?? "-"}
                        </td>
                     </tr>
                     : null
                  );
               })}
            </table>
         </div>

         <div className="sep10"></div>
         <BuildingMoveComponent gameState={gameState} xy={xy} />
         <BuildingConsumeComponent gameState={gameState} xy={xy} />
         <BuildingStorageComponent gameState={gameState} xy={xy} />
         <BuildingElectricityComponent gameState={gameState} xy={xy} />
         <BuildingValueComponent gameState={gameState} xy={xy} />
         <BuildingColorComponent gameState={gameState} xy={xy} />
         <BuildingWikipediaComponent gameState={gameState} xy={xy} />
      </div>
   );
}
