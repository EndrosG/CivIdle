import { NoPrice, NoStorage, type Material } from "../../../shared/definitions/MaterialDefinitions";
import { IOFlags } from "../../../shared/logic/BuildingLogic";
import { Config } from "../../../shared/logic/Config";
import { notifyGameStateUpdate } from "../../../shared/logic/GameStateLogic";
import { getBuildingIO, unlockedResources } from "../../../shared/logic/IntraTickCache";
import type { IRecyclingBuildingData } from "../../../shared/logic/Tile";
import { isEmpty, keysOf } from "../../../shared/utilities/Helper";
import { $t, L } from "../../../shared/utilities/i18n";
import { playClick } from "../visuals/Sound";
import { ApplyToAllComponent } from "./ApplyToAllComponent";
import { BuildingIOTreeViewComponent } from "./BuildingIOTreeViewComponent";
import type { IBuildingComponentProps } from "./BuildingPage";
import { RenderHTML } from "./RenderHTMLComponent";
import { WarningComponent } from "./WarningComponent";

export function BuildingProduceComponent({ gameState, xy }: IBuildingComponentProps): React.ReactNode {
   const output = getBuildingIO(xy, "output", IOFlags.Capacity, gameState);
   if (isEmpty(output)) {
      return null;
   }
   return (
      <fieldset>
         <legend>{$t(L.Produce)}</legend>
         {gameState.tiles.get(xy)?.building?.type === "CloneLab" ? (
            <WarningComponent icon="info" className="mb10 text-small">
               <RenderHTML html={$t(L.CloneLabScienceMultiplierHTML)} />
            </WarningComponent>
         ) : null}
         <ChooseResource gameState={gameState} xy={xy} />
         <BuildingIOTreeViewComponent gameState={gameState} xy={xy} type="output" />
      </fieldset>
   );
}

// Added by Lydia, mostly copied from BuildingConsumeComponent
function ChooseResource({ gameState, xy }: IBuildingComponentProps): React.ReactNode {
   const building = gameState.tiles.get(xy)?.building;
   if (building && building.type.match("Recycling")) {
      const c = building as IRecyclingBuildingData;
      const resources = keysOf(unlockedResources(gameState))
         .filter((r) => !NoStorage[r] && !NoPrice[r])
         .sort((a, b) => Config.Material[a].name().localeCompare(Config.Material[b].name()));
      return (
         <>
            <select
               className="w100"
               value={c.recycleOutput}
               onChange={(e) => {
                  playClick();
                  const res = e.target.value as Material;
                  if (c.recycleOutput !== res) {
                     c.recycleOutput = res;
                     notifyGameStateUpdate();
                  }
               }}
            >
               {resources.map((r) => (
                  <option key={r} value={r}>
                     {Config.Material[r].name()}
                  </option>
               ))}
            </select>
            <div className="sep10" />
            <ApplyToAllComponent
               xy={xy}
               getOptions={() => {
                  return { recycleInput: c.recycleInput, recycleOutput: c.recycleOutput } as IRecyclingBuildingData;
               }}
               gameState={gameState}
            />
            <div className="separator" />
         </>
      );
   }

   return null;
}
