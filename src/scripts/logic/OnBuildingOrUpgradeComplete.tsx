import { isSpecialBuilding } from "../../../shared/logic/BuildingLogic";
import { Config } from "../../../shared/logic/Config";
import type { GreatPeopleChoiceV2 } from "../../../shared/logic/GameState";
import { getGameOptions, getGameState } from "../../../shared/logic/GameStateLogic";
import { rollGreatPeopleThisRun } from "../../../shared/logic/RebirthLogic";
import { getCurrentAge } from "../../../shared/logic/TechLogic";
import type { IChateauFrontenacBuildingData } from "../../../shared/logic/Tile";
import { entriesOf, keysOf, shuffle, type Tile } from "../../../shared/utilities/Helper";
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
      // Added by Lydia
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
      // Added by Lydia, copied from RebirthModal
      case "ContainerHut": {
         gs.tiles.forEach((tile, xy) => {
            const b = tile.building;
            if (b && b.level > (getGameOptions().maxBuildingLevels[b.type] ?? 0)) {
               getGameOptions().maxBuildingLevels[b.type] = b.level;
            }
            if (b?.type.match("ContainerPort")) {
               b.level = 1;
               b.desiredLevel = 1;
               b.stack = 1;
               b.desiredStack = 1;
            }
         });
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
      case "ChateauFrontenac": {
         const chateauFrontenac = building as IChateauFrontenacBuildingData;
         if (!chateauFrontenac.buildings) {
            chateauFrontenac.buildings = {};
         }
         // Modified by Lydia
         // const techAge = getCurrentAge(gs);
         let myage = getCurrentAge(gs);
         if (Config.TechAge[myage].hidden === true) {
            myage = "InformationAge";
         }
         const candidates = entriesOf(Config.BuildingTechAge)
            .filter(([building, age]) => {
               return (
                  age === myage &&
                  !isSpecialBuilding(building) &&
                  (!Config.BuildingCity[building] || Config.BuildingCity[building] === gs.city)
               );
            })
            .map(([building]) => building);
         for (let i = 1; i <= building.level; i++) {
            if (!chateauFrontenac.buildings[i]) {
               chateauFrontenac.buildings[i] = {
                  selected: undefined,
                  options: shuffle(candidates).slice(0, 3),
               };
            }
         }
         break;
      }
   }
}
