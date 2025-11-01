import { Config } from "../../../shared/logic/Config";
import { type GreatPeopleChoiceV2 } from "../../../shared/logic/GameState";
import { getGameState } from "../../../shared/logic/GameStateLogic";
import { rollGreatPeopleThisRun } from "../../../shared/logic/RebirthLogic";
import { getCurrentAge } from "../../../shared/logic/TechLogic";
import { keysOf, type Tile } from "../../../shared/utilities/Helper";
import { ChooseGreatPersonModal } from "../ui/ChooseGreatPersonModal";
import { showModal } from "../ui/GlobalModal";
import { playAgeUp } from "../visuals/Sound";

export function onBuildingOrUpgradeComplete(xy: Tile): void {
   const gs = getGameState();
   const building = gs.tiles.get(xy)?.building;
   if (!building) {
      return;
   }

   switch (building.type) {
      // added by Lydia
      case "TourDeFrance":
      case "GiroDItalia": {
         // These two wonders give a fixed (themed) choice set ... bicycle, newspaper / sports and magazine GP
         const candidates1: GreatPeopleChoiceV2 = {
            // choices: [Config.GreatPerson["MiguelIndurain"], Config.GreatPerson["PierreDeCoubertin"], Config.GreatPerson["JosephPulitzer"]],
            choices: ["MiguelIndurain", "PierreDeCoubertin", "JosephPulitzer"],
            amount: 1,
         }
         if (candidates1) {
            gs.greatPeopleChoicesV2.push(candidates1);
         }
         if (gs.greatPeopleChoicesV2.length > 0) {
            playAgeUp();
            showModal(<ChooseGreatPersonModal permanent={false} />);
         }
         break;
      }

      // CivIdle Standard
      case "SantaClausVillage": {
         const candidates1 = rollGreatPeopleThisRun(new Set([getCurrentAge(gs)]), gs.city, 4);
         if (candidates1) {
            gs.greatPeopleChoicesV2.push(candidates1);
         }
         if (gs.greatPeopleChoicesV2.length > 0) {
            playAgeUp();
            showModal(<ChooseGreatPersonModal permanent={false} />);
         }
         break;
      }
      case "QutbMinar": {
         const ages = new Set(keysOf(Config.TechAge));
         ages.delete(getCurrentAge(gs));
         const candidates1 = rollGreatPeopleThisRun(ages, gs.city, 2);
         if (candidates1) {
            gs.greatPeopleChoicesV2.push(candidates1);
         }
         if (gs.greatPeopleChoicesV2.length > 0) {
            playAgeUp();
            showModal(<ChooseGreatPersonModal permanent={false} />);
         }
         break;
      }
   }
}
