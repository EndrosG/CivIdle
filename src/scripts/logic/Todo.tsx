import { GreatPersonType } from "../../../shared/definitions/GreatPersonDefinitions";
import { PatchNotes } from "../../../shared/definitions/PatchNotes";
import { Config } from "../../../shared/logic/Config";
import { STEAM_PATCH_NOTES_URL } from "../../../shared/logic/Constants";
import type { GameOptions, GameState } from "../../../shared/logic/GameState";
import { notifyGameOptionsUpdate } from "../../../shared/logic/GameStateLogic";
import { getVotingTime } from "../../../shared/logic/PlayerTradeLogic";
import {
   getGreatPersonUpgradeCost,
   getMissingGreatPeopleForWisdom,
} from "../../../shared/logic/RebirthLogic";
import { getScienceAmount, getTechUnlockCost, unlockableTechs } from "../../../shared/logic/TechLogic";
import { NotProducingReason, Tick } from "../../../shared/logic/TickLogic";
import { HOUR, entriesOf, formatHMS, mapCount } from "../../../shared/utilities/Helper";
import { L, t } from "../../../shared/utilities/i18n";
import { PlayerMapScene } from "../scenes/PlayerMapScene";
import { TechTreeScene } from "../scenes/TechTreeScene";
import { LookAtMode, WorldScene } from "../scenes/WorldScene";
import { ChooseGreatPersonModal } from "../ui/ChooseGreatPersonModal";
import { showModal } from "../ui/GlobalModal";
import { ManageAgeWisdomModal } from "../ui/ManageAgeWisdomModal";
import { ManagePermanentGreatPersonModal } from "../ui/ManagePermanentGreatPersonModal";
import { TilePage } from "../ui/TilePage";
import { openUrl } from "../utilities/Platform";
import { Singleton } from "../utilities/Singleton";
import { getBuildNumber, getVersion } from "./Version";

export interface ITodo {
   name: () => string;
   icon: string;
   className: string;
   desc: (gs: GameState, options: GameOptions) => string;
   value?: (gs: GameState, options: GameOptions) => number;
   condition: (gs: GameState, options: GameOptions) => boolean;
   onClick: (gs: GameState, options: GameOptions) => void;
}

export const _Todos = {
   E1: {
      name: () => t(L.HappinessTooLow),
      icon: "sentiment_dissatisfied",
      className: "text-red",
      desc: (gs, options) => t(L.HappinessTooLowHTML),
      condition: (gs) => (Tick.current.happiness?.value ?? 0) < -25,
      onClick: (gs, options) => {
         const xy = Tick.current.specialBuildings.get("Headquarter")?.tile;
         if (xy) {
            Singleton().sceneManager.getCurrent(WorldScene)?.lookAtTile(xy, LookAtMode.Select);
            Singleton().routeTo(TilePage, { xy, expandHappiness: true });
         }
      },
   },
   E2: {
      name: () => t(L.MoreWorkersNeeded),
      icon: "engineering",
      className: "text-red",
      desc: (gs, options) =>
         t(L.MoreWorkersNeededHTML, {
            count: mapCount(
               Tick.current.notProducingReasons,
               (v) => v === NotProducingReason.NotEnoughWorkers,
            ),
         }),
      condition: (gs) => {
         for (const [xy, reason] of Tick.current.notProducingReasons) {
            if (reason === NotProducingReason.NotEnoughWorkers) {
               return true;
            }
         }
         return false;
      },
      value: (gs, options) => {
         return mapCount(Tick.current.notProducingReasons, (v) => v === NotProducingReason.NotEnoughWorkers);
      },
      onClick: (gs, options) => {
         Singleton()
            .sceneManager.getCurrent(WorldScene)
            ?.drawSelection(
               null,
               Array.from(Tick.current.notProducingReasons.entries()).flatMap(([xy, reason]) =>
                  reason === NotProducingReason.NotEnoughWorkers ? [xy] : [],
               ),
            );
      },
   },
   E3: {
      name: () => t(L.MoreResourceNeeded),
      icon: "production_quantity_limits",
      className: "text-red",
      desc: (gs, options) =>
         t(L.MoreResourceNeededHTML, {
            count: mapCount(
               Tick.current.notProducingReasons,
               (v) => v === NotProducingReason.NotEnoughResources,
            ),
         }),
      condition: (gs) => {
         for (const [xy, reason] of Tick.current.notProducingReasons) {
            if (reason === NotProducingReason.NotEnoughResources) {
               return true;
            }
         }
         return false;
      },
      value: (gs, options) => {
         return mapCount(
            Tick.current.notProducingReasons,
            (v) => v === NotProducingReason.NotEnoughResources,
         );
      },
      onClick: (gs, options) => {
         Singleton()
            .sceneManager.getCurrent(WorldScene)
            ?.drawSelection(
               null,
               Array.from(Tick.current.notProducingReasons.entries()).flatMap(([xy, reason]) =>
                  reason === NotProducingReason.NotEnoughResources ? [xy] : [],
               ),
            );
      },
   },
   E4: {
      name: () => t(L.TileNotPowered),
      icon: "electrical_services",
      className: "text-red",
      desc: (gs, options) =>
         t(L.TileNotPoweredHTML, {
            count: mapCount(Tick.current.notProducingReasons, (v) => v === NotProducingReason.NoPower),
         }),
      condition: (gs) => {
         for (const [xy, reason] of Tick.current.notProducingReasons) {
            if (reason === NotProducingReason.NoPower) {
               return true;
            }
         }
         return false;
      },
      value: (gs, options) => {
         return mapCount(Tick.current.notProducingReasons, (v) => v === NotProducingReason.NoPower);
      },
      onClick: (gs, options) => {
         Singleton()
            .sceneManager.getCurrent(WorldScene)
            ?.drawSelection(
               null,
               Array.from(Tick.current.notProducingReasons.entries()).flatMap(([xy, reason]) =>
                  reason === NotProducingReason.NoPower ? [xy] : [],
               ),
            );
      },
   },
   W1: {
      name: () => t(L.BuildingsStorageFull),
      icon: "storage",
      className: "text-orange",
      desc: (gs, options) =>
         t(L.BuildingsStorageFullHTML, {
            count: mapCount(Tick.current.notProducingReasons, (v) => v === NotProducingReason.StorageFull),
         }),
      condition: (gs) => {
         for (const [xy, reason] of Tick.current.notProducingReasons) {
            if (reason === NotProducingReason.StorageFull) {
               return true;
            }
         }
         return false;
      },
      value: (gs, options) => {
         return mapCount(Tick.current.notProducingReasons, (v) => v === NotProducingReason.StorageFull);
      },
      onClick: (gs, options) => {
         Singleton()
            .sceneManager.getCurrent(WorldScene)
            ?.drawSelection(
               null,
               Array.from(Tick.current.notProducingReasons.entries()).flatMap(([xy, reason]) =>
                  reason === NotProducingReason.StorageFull ? [xy] : [],
               ),
            );
      },
   },
   W2: {
      name: () => t(L.BuildingsTurnedOff),
      icon: "motion_photos_off",
      className: "text-orange",
      desc: (gs, options) =>
         t(L.BuildingsTurnedOffHTML, {
            count: mapCount(Tick.current.notProducingReasons, (v) => v === NotProducingReason.TurnedOff),
         }),
      condition: (gs) => {
         for (const [xy, reason] of Tick.current.notProducingReasons) {
            if (reason === NotProducingReason.TurnedOff) {
               return true;
            }
         }
         return false;
      },
      value: (gs, options) => {
         return mapCount(Tick.current.notProducingReasons, (v) => v === NotProducingReason.TurnedOff);
      },
      onClick: (gs, options) => {
         Singleton()
            .sceneManager.getCurrent(WorldScene)
            ?.drawSelection(
               null,
               Array.from(Tick.current.notProducingReasons.entries()).flatMap(([xy, reason]) =>
                  reason === NotProducingReason.TurnedOff ? [xy] : [],
               ),
            );
      },
   },
   W3: {
      name: () => t(L.TradeTileBonusWillRefresh),
      icon: "access_time",
      className: "text-orange",
      desc: (gs, options) =>
         t(L.TradeTileBonusWillRefreshHTML, {
            time: formatHMS(getVotingTime()),
         }),
      condition: (gs) => {
         return getVotingTime() <= 8 * HOUR;
      },
      onClick: (gs, options) => {
         Singleton().sceneManager.loadScene(PlayerMapScene);
      },
   },
   I1: {
      name: () => t(L.UnlockableTech),
      icon: "tips_and_updates",
      className: "text-green",
      desc: (gs) => {
         const science = getScienceAmount(gs);
         const techs = unlockableTechs(gs)
            .flatMap((tech) => (science >= getTechUnlockCost(tech) ? [Config.Tech[tech].name()] : []))
            .join(", ");
         return t(L.UnlockableTechHTML, { techs });
      },
      condition: (gs) => {
         const techs = unlockableTechs(gs);
         const science = getScienceAmount(gs);
         return techs.some((tech) => science >= getTechUnlockCost(tech));
      },
      onClick: (gs, options) => {
         Singleton().sceneManager.loadScene(TechTreeScene);
      },
   },
   I2: {
      name: () => t(L.UpgradeablePermanentGreatPeople),
      icon: "person_celebrate",
      className: "text-green",
      desc: (gs, options) => {
         const gps = entriesOf(options.greatPeople)
            .flatMap(([gp, inv]) =>
               Config.GreatPerson[gp].type === GreatPersonType.Normal &&
               inv.amount >= getGreatPersonUpgradeCost(gp, inv.level + 1)
                  ? [Config.GreatPerson[gp].name()]
                  : [],
            )
            .join(", ");
         return t(L.UpgradeablePermanentGreatPeopleHTML, { gps });
      },
      condition: (gs, options) =>
         entriesOf(options.greatPeople).some(
            ([gp, inv]) =>
               Config.GreatPerson[gp].type === GreatPersonType.Normal &&
               inv.amount >= getGreatPersonUpgradeCost(gp, inv.level + 1),
         ),
      onClick: (gs, options) => {
         showModal(<ManagePermanentGreatPersonModal />);
      },
   },
   I3: {
      name: () => t(L.UnclaimedGreatPeopleThisRun),
      icon: "person_4",
      className: "text-green",
      desc: (gs, options) => {
         return t(L.UnclaimedGreatPeopleThisRunHTML, { count: gs.greatPeopleChoicesV2.length });
      },
      condition: (gs, options) => gs.greatPeopleChoicesV2.length > 0,
      onClick: (gs, options) => {
         if (gs.greatPeopleChoicesV2.length > 0) {
            showModal(<ChooseGreatPersonModal permanent={false} />);
         }
      },
   },
   I4: {
      name: () => t(L.UnclaimedPermanentGreatPeople),
      icon: "supervisor_account",
      className: "text-green",
      desc: (gs, options) => {
         return t(L.UnclaimedPermanentGreatPeopleHTML, { count: options.greatPeopleChoicesV2.length });
      },
      condition: (gs, options) => options.greatPeopleChoicesV2.length > 0,
      onClick: (gs, options) => {
         if (options.greatPeopleChoicesV2.length > 0) {
            showModal(<ChooseGreatPersonModal permanent={true} />);
         }
      },
   },
   I5: {
      name: () => t(L.UpgradeableAgeWisdom),
      icon: "emoji_objects",
      className: "text-green",
      desc: (gs, options) => {
         return t(L.UpgradeableAgeWisdomHTML, { count: gs.greatPeopleChoicesV2.length });
      },
      condition: (gs, options) => {
         for (const [age] of entriesOf(Config.TechAge)) {
            if (age === "BronzeAge") {
               continue;
            }
            if (getMissingGreatPeopleForWisdom(age).size <= 0) {
               return false;
            }
         }
         return true;
      },
      onClick: (gs, options) => {
         if (gs.greatPeopleChoicesV2.length > 0) {
            showModal(<ManageAgeWisdomModal />);
         }
      },
   },
   S1: {
      name: () => t(L.ReadFullPatchNotes),
      icon: "browser_updated",
      className: "text-blue",
      desc: (gs, options) => {
         return t(L.ReadPatchNotesHTMLV2, { version: getVersion(), build: getBuildNumber() });
      },
      condition: (gs, options) => options.buildNumber !== getBuildNumber(),
      onClick: (gs, options) => {
         options.buildNumber = getBuildNumber();
         notifyGameOptionsUpdate();
         const patchNote = PatchNotes[0];
         const link = patchNote.link;
         if (link) {
            openUrl(link);
            return;
         }
         openUrl(STEAM_PATCH_NOTES_URL);
      },
   },
} as const satisfies Record<string, ITodo>;

export type Todo = keyof typeof _Todos;
export const Todo: Record<Todo, ITodo> = _Todos;
