import Tippy from "@tippyjs/react";
import { useState } from "react";
import { notifyGameStateUpdate } from "../../../shared/logic/GameStateLogic";
import { clearIntraTickCache } from "../../../shared/logic/IntraTickCache";
import { RequestResetTile } from "../../../shared/logic/TechLogic";
import { Tick } from "../../../shared/logic/TickLogic";
import { clearTransportSourceCache } from "../../../shared/logic/Update";
import {
   pointToTile,
   safeAdd
} from "../../../shared/utilities/Helper";
import { $t, L } from "../../../shared/utilities/i18n";
import { WorldScene } from "../scenes/WorldScene";
import { Singleton } from "../utilities/Singleton";
import { playClick, playError, playSuccess } from "../visuals/Sound";
import type { IBuildingComponentProps } from "./BuildingPage";
import { hideToast, showToast } from "./GlobalModal";


export function BuildingMoveComponent({ gameState, xy }: IBuildingComponentProps): React.ReactNode {
   const tile = gameState.tiles.get(xy);
   const building = tile?.building;
   if (!building) {
      return null;
   }
   const [moving, setMoving] = useState(false);
   const theMet = Tick.current.specialBuildings.get("TheMet");
   if (theMet) {
      return (
         <>
            <fieldset>
               {theMet ? (
                  <button
                     className="row w100 jcc mt5"
                     disabled={moving || (theMet.building.resources.Teleport ?? 0) <= 0}
                     onClick={async () => {
                        playClick();
                        showToast($t(L.MoveBuildingSelectTileToastHTML), Number.POSITIVE_INFINITY);
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
                        content={$t(L.MoveBuildingNoTeleport)}
                        disabled={(theMet.building.resources.Teleport ?? 0) > 0}
                     >
                        <div className="f1">{moving ? $t(L.MoveBuildingSelectTile) : $t(L.MoveBuilding)}</div>
                     </Tippy>
                  </button>
               ) : null}
            </fieldset>
         </>
      );
   }
   return null;
}
