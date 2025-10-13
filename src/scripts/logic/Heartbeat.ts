import { Config } from "../../../shared/logic/Config";
import { GLOBAL_PARAMS } from "../../../shared/logic/Constants";
import { getGameOptions, getGameState } from "../../../shared/logic/GameStateLogic";
import { getPermanentGreatPeopleLevel } from "../../../shared/logic/RebirthLogic";
import { getCurrentAge } from "../../../shared/logic/TechLogic";
import { totalEmpireValue } from "../../../shared/logic/TickLogic";
import { addSystemMessage, client, getUser } from "../rpc/RPCClient";

export async function clientHeartbeat(): Promise<void> {
   const user = getUser();
   const gs = getGameState();
   const options = getGameOptions();

   let mycity = gs.city;
   if (Config.City[mycity].hidden === true) {
      if (GLOBAL_PARAMS.DEBUG_HIDDEN === true) {
         addSystemMessage(`Debug info (heartbeat): ${mycity} is a hidden city. Replacing by German.`);
      }
      mycity = "German";
   }
   let myage = getCurrentAge(gs);
   if (Config.TechAge[myage].hidden === true) {
      if (GLOBAL_PARAMS.DEBUG_HIDDEN === true) {
         addSystemMessage(`Debug info (heartbeat): ${myage} is a hidden age. Replacing by InformationAge.`);
      }
      myage = "InformationAge";
   }

   client.heartbeatV2({
      clientTick: gs.tick,
      clientTime: Date.now(),
      gameId: gs.id,
      city: mycity,
      techAge: myage,
      userFlags: user?.attr ?? null,
      empireValue: totalEmpireValue(gs),
      greatPeopleLevel: getPermanentGreatPeopleLevel(options),
   });
}
