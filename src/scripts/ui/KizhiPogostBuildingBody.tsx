import { getMultipliersFor } from "../../../shared/logic/BuildingLogic";
import { $t, L } from "../../../shared/utilities/i18n";
import { BuildingColorComponent } from "./BuildingColorComponent";
import { BuildingDescriptionComponent } from "./BuildingDescriptionComponent";
import type { IBuildingComponentProps } from "./BuildingPage";
import { BuildingUpgradeComponent } from "./BuildingUpgradeComponent";
import { BuildingValueComponent } from "./BuildingValueComponent";
import { BuildingWikipediaComponent } from "./BuildingWikipediaComponent";

export function KizhiPogostBuildingBody({ gameState, xy }: IBuildingComponentProps): React.ReactNode {
   const building = gameState.tiles.get(xy)?.building;
   if (!building) {
      return null;
   }
   return (
      <div className="window-body">
         <fieldset>
            <legend>{$t(L.ProductionMultiplier)}</legend>
            <ul className="tree-view">
               {getMultipliersFor(xy, false, gameState).map((m) => {
                  if (!m.output) {
                     return null;
                  }
                  return (
                     <li className="row" key={m.source}>
                        <div className="f1">{m.source}</div>
                        <div className="text-strong">{m.output}</div>
                     </li>
                  );
               })}
            </ul>
         </fieldset>
         <BuildingDescriptionComponent gameState={gameState} xy={xy} />
         <BuildingUpgradeComponent gameState={gameState} xy={xy} key={xy} />
         <BuildingValueComponent gameState={gameState} xy={xy} />
         <BuildingWikipediaComponent gameState={gameState} xy={xy} />
         <BuildingColorComponent gameState={gameState} xy={xy} />
      </div>
   );
}
