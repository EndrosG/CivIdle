import Tippy from "@tippyjs/react";
import classNames from "classnames";
import { useCallback, useState } from "react";
import { TableVirtuoso } from "react-virtuoso";
import { NoPrice, NoStorage, type Material } from "../../../shared/definitions/MaterialDefinitions";
import { Config } from "../../../shared/logic/Config";
import { GLOBAL_PARAMS, TRADE_CANCEL_REFUND_PERCENT } from "../../../shared/logic/Constants";
import { getGameOptions } from "../../../shared/logic/GameStateLogic";
import { getTradePercentage, hasResourceForPlayerTrade } from "../../../shared/logic/PlayerTradeLogic";
import { addResourceTo, combineResources, getAvailableStorage } from "../../../shared/logic/ResourceLogic";
import { Tick } from "../../../shared/logic/TickLogic";
import { UserAttributes, type IClientTrade } from "../../../shared/utilities/Database";
import {
   CURRENCY_PERCENT_EPSILON,
   cls,
   forEach,
   formatNumber,
   formatPercent,
   hasFlag,
   mapOf,
   mathSign,
   numberToRoman,
   safeParseInt,
} from "../../../shared/utilities/Helper";
import { $t, L } from "../../../shared/utilities/i18n";
import { useGameState } from "../Global";
import { AccountLevelNames } from "../logic/AccountLevel";
import { PendingClaims } from "../logic/PendingClaim";
import { client, useTrades, useUser } from "../rpc/RPCClient";
import { getCountryName } from "../utilities/CountryCode";
import { useForceUpdate } from "../utilities/Hook";
import { playError, playKaching } from "../visuals/Sound";
import { AddTradeButtonComponent } from "./AddTradeComponent";
import { AddTradeModal } from "./AddTradeModal";
import { AvailableTradingResourcesModal } from "./AvailableTradingResourcesModal";
import { ConfirmModal } from "./ConfirmModal";
import { FillPlayerTradeModal } from "./FillPlayerTradeModal";
import { FixedLengthText } from "./FixedLengthText";
import { showToast } from "./GlobalModal";
import { FormatNumber } from "./HelperComponents";
import { PendingClaimModal } from "./PendingClaimModal";
import { RenderHTML } from "./RenderHTMLComponent";
import { AccountLevelComponent, MiscTextureComponent, PlayerFlagComponent } from "./TextureSprites";

/*
const savedResourceWantFilters: Set<Material> = new Set();
const savedResourceOfferFilters: Set<Material> = new Set();
const savedAccountRanks: Set<string> = new Set();
const savedPlayerFlags: Set<string> = new Set();
let savedPlayerNameFilter = "";
let savedPlayerBanNameFilter = "";
let savedMaxTradeAmountFilter = 0;
let savedTradePercentageFilter = -1;
*/
const playerTradesSortingState: { column: keyof IClientTrade | "difference" | "tradeProfit"; asc: boolean } = {
   column: "buyResource",
   asc: true,
};

export function filterPlayerName(playerName: string): void {
   // clearSavedFilters();
   getGameOptions().tradeFilters.savedPlayerNameFilter = playerName;
}

function clearSavedFilters() {
   getGameOptions().tradeFilters.savedResourceWantFilters.clear();
   getGameOptions().tradeFilters.savedResourceOfferFilters.clear();
   getGameOptions().tradeFilters.savedAccountRanks.clear();
   getGameOptions().tradeFilters.savedPlayerFlags.clear();
   getGameOptions().tradeFilters.savedPlayerNameFilter = "";
   // savedPlayerBanNameFilter = "";
   getGameOptions().tradeFilters.savedMaxTradeAmountFilter = 0;
   getGameOptions().tradeFilters.savedTradePercentageFilter = -100;
}

export function PlayerTradeComponent({
   showModal,
   hideModal,
}: {
   showModal: (modal: React.ReactNode) => void;
   hideModal: () => void;
}): React.ReactNode {
   const [resourceWantFilters, setResourceWantFilters] = useState(getGameOptions().tradeFilters.savedResourceWantFilters);
   const [resourceOfferFilters, setResourceOfferFilters] = useState(getGameOptions().tradeFilters.savedResourceOfferFilters);
   const [accountRankFilters, setAccountRankFilters] = useState(getGameOptions().tradeFilters.savedAccountRanks);
   const [playerFlagFilters, setPlayerFlagFilters] = useState(getGameOptions().tradeFilters.savedPlayerFlags);
   const [playerNameFilter, setPlayerNameFilter] = useState<string>(getGameOptions().tradeFilters.savedPlayerNameFilter);
   const [playerBanNameFilter, setPlayerBanNameFilter] = useState<string>(getGameOptions().tradeFilters.savedPlayerBanNameFilter);
   const [tradeAmountFilter, setTradeAmountFilter] = useState<number>(getGameOptions().tradeFilters.savedMaxTradeAmountFilter);
   const [tradePercentageFilter, setTradePercentageFilter] = useState<number>(getGameOptions().tradeFilters.savedTradePercentageFilter);
   const trades = useTrades();
   const user = useUser();
   const forceUpdate = useForceUpdate();

   const clearFilters = () => {
      clearSavedFilters();
      applyFilters();
   };

   const applyFilters = useCallback(() => {
      setResourceWantFilters(new Set(getGameOptions().tradeFilters.savedResourceWantFilters));
      setResourceOfferFilters(new Set(getGameOptions().tradeFilters.savedResourceOfferFilters));
      setAccountRankFilters(new Set(getGameOptions().tradeFilters.savedAccountRanks));
      setPlayerFlagFilters(new Set(getGameOptions().tradeFilters.savedPlayerFlags));
      setPlayerNameFilter(getGameOptions().tradeFilters.savedPlayerNameFilter);
      setPlayerBanNameFilter(getGameOptions().tradeFilters.savedPlayerBanNameFilter);
      setTradeAmountFilter(getGameOptions().tradeFilters.savedMaxTradeAmountFilter);
      setTradePercentageFilter(getGameOptions().tradeFilters.savedTradePercentageFilter);
   }, []);

   const resourceSet = new Set<Material>();
   trades.forEach((t) => {
      resourceSet.add(t.buyResource);
      resourceSet.add(t.sellResource);
   });
   // Added by Lydia @ 2026-05-01 : I want to define trade filters on resources which I do have, not only which exist in current trades
   if (GLOBAL_PARAMS.FILTERTRADE_ALL_MATERIALS) {
      const availableResources = combineResources(
         Array.from(Tick.current.playerTradeBuildings.values()).map((m) => m.resources),
      );
      forEach(availableResources, (res) => {
         if (!NoPrice[res] && !NoStorage[res]) {
            resourceSet.add(res);
         }
      });
   }

   const resources = Array.from(resourceSet);
   const filterCount =
      resourceWantFilters.size +
      resourceOfferFilters.size +
      (playerNameFilter.length > 0 ? 1 : 0) +
      (playerBanNameFilter.length > 0 ? 1 : 0) +
      accountRankFilters.size +
      playerFlagFilters.size +
      (tradeAmountFilter > 0 ? 1 : 0) +
      (tradePercentageFilter > -100 ? 1 : 0);
   return (
      <>
         <div className="row" style={{ margin: "2px 1px" }}>
            <AddTradeButtonComponent onClick={() => showModal(<AddTradeModal hideModal={hideModal} />)} />
            <button
               className={cls(PendingClaims.length > 0 ? "text-strong" : null)}
               onClick={() => showModal(<PendingClaimModal hideModal={hideModal} />)}
            >
               {$t(L.PlayerTradeTabPendingTrades)} ({PendingClaims.length})
            </button>
            <button onClick={() => showModal(<AvailableTradingResourcesModal hideModal={hideModal} />)}>
               {$t(L.PlayerTradeTabAvailableTrades)}
            </button>
            <div className="w10"></div>
            <button
               className={cls("row jcc", filterCount > 0 ? "text-strong text-blue" : null)}
               onClick={() => {
                  showModal(
                     <PlayerTradeFilterModal
                        hideModal={hideModal}
                        resources={resources}
                        applyFilters={applyFilters}
                     />,
                  );
               }}
            >
               <div className="m-icon small">filter_list</div>
               <div className="f1">
                  {$t(L.PlayerTradeFilters)} ({filterCount})
               </div>
            </button>
            <Tippy content={$t(L.PlayerTradeFilterWhatIHave)}>
               <button
                  onClick={() => {
                     clearSavedFilters();
                     resources.forEach((res) => {
                        if (hasResourceForPlayerTrade(res)) {
                           getGameOptions().tradeFilters.savedResourceWantFilters.add(res);
                        }
                     });
                     applyFilters();
                  }}
               >
                  <div className="m-icon small">database</div>
               </button>
            </Tippy>
            <Tippy content={$t(L.PlayerTradeClearFilter)}>
               <button onClick={clearFilters}>
                  <div className="m-icon small">cancel</div>
               </button>
            </Tippy>
         </div>
         <div className="table-view">
            <TableVirtuoso
               style={{ height: "70vh" }}
               data={trades
                  .filter((trade) => {
                     const resourceFilter =
                        (resourceWantFilters.size === 0 && resourceOfferFilters.size === 0) ||
                        resourceWantFilters.has(trade.buyResource) ||
                        resourceOfferFilters.has(trade.sellResource);

                     const filterNames = playerNameFilter
                        .toLowerCase()
                        .split(" ")
                        .map((name) => name.trim())
                        .filter((name) => name.length > 0);

                     const nameFilter =
                        filterNames.length === 0 ||
                        filterNames.some((name) => trade.from.toLowerCase().includes(name));

                     const filterBanNames = playerBanNameFilter
                        .toLowerCase()
                        .split(" ")
                        .map((name) => name.trim())
                        .filter((name) => name.length > 0);

                     const banNameFilter =
                        filterBanNames.length === 0 ||
                        filterBanNames.some((name) => !trade.from.toLowerCase().includes(name));

                     const amountFilter =
                        tradeAmountFilter === 0 ||
                        (tradeAmountFilter > 0 && trade.buyAmount <= tradeAmountFilter);

                     const percentageFilter =
                        tradePercentageFilter === -100 ||
                        (tradePercentageFilter > -100 && getTradePercentage(trade) * 100 >= tradePercentageFilter);

                     const accountRankFilter =
                        accountRankFilters.size === 0 || accountRankFilters.has(String(trade.fromLevel));

                     const flagFilter = getGameOptions().tradeFilters.savedPlayerFlags.size === 0 || getGameOptions().tradeFilters.savedPlayerFlags.has(trade.fromFlag);

                     return (
                        (resourceFilter && nameFilter && banNameFilter && amountFilter && percentageFilter && accountRankFilter && flagFilter) ||
                        (user && user.userId === trade.fromId)
                     );
                  })
                  .sort((a, b) => {
                     const asc = playerTradesSortingState.asc ? 1 : -1;
                     if (a.fromId === user?.userId && b.fromId !== user?.userId) {
                        return -asc;
                     }
                     if (a.fromId !== user?.userId && b.fromId === user?.userId) {
                        return asc;
                     }
                     let result = asc;
                     switch (playerTradesSortingState.column) {
                        case "buyResource":
                           result *= Config.Material[a.buyResource]
                              .name()
                              .localeCompare(Config.Material[b.buyResource].name());
                           break;
                        case "buyAmount":
                           result *= a.buyAmount - b.buyAmount;
                           break;
                        case "sellResource":
                           result *= Config.Material[a.sellResource]
                              .name()
                              .localeCompare(Config.Material[b.sellResource].name());
                           break;
                        case "sellAmount":
                           result *= a.sellAmount - b.sellAmount;
                           break;
                        case "difference":
                           result *= getTradePercentage(a) - getTradePercentage(b);
                           break;
                        case "tradeProfit":
                           result *= (a.sellAmount * (Config.MaterialPrice[a.sellResource] ?? 0) - a.buyAmount * (Config.MaterialPrice[a.buyResource] ?? 0)) -
                              (b.sellAmount * (Config.MaterialPrice[b.sellResource] ?? 0) - b.buyAmount * (Config.MaterialPrice[b.buyResource] ?? 0));
                           break;
                        case "from":
                           result *= a.from.localeCompare(b.from);
                           break;
                     }
                     return result;
                  })}
               fixedHeaderContent={() => {
                  return (
                     <tr>
                        <th
                           className="pointer"
                           onClick={() => {
                              playerTradesSortingState.column = "buyResource";
                              playerTradesSortingState.asc = !playerTradesSortingState.asc;
                              forceUpdate();
                           }}
                        >
                           <div className="row pointer">
                              {$t(L.PlayerTradeWant)}
                              {playerTradesSortingState.column === "buyResource" ? (
                                 <div className="m-icon small">
                                    {playerTradesSortingState.asc ? "arrow_upward" : "arrow_downward"}
                                 </div>
                              ) : null}
                           </div>
                        </th>
                        <th
                           className="pointer"
                           onClick={() => {
                              playerTradesSortingState.column = "buyAmount";
                              playerTradesSortingState.asc = !playerTradesSortingState.asc;
                              forceUpdate();
                           }}
                        >
                           {playerTradesSortingState.column === "buyAmount" ? (
                              <div className="m-icon small">
                                 {playerTradesSortingState.asc ? "arrow_upward" : "arrow_downward"}
                              </div>
                           ) : null}
                        </th>
                        <th
                           className="pointer"
                           onClick={() => {
                              playerTradesSortingState.column = "sellResource";
                              playerTradesSortingState.asc = !playerTradesSortingState.asc;
                              forceUpdate();
                           }}
                        >
                           <div className="row">
                              {$t(L.PlayerTradeOffer)}
                              {playerTradesSortingState.column === "sellResource" ? (
                                 <div className="m-icon small">
                                    {playerTradesSortingState.asc ? "arrow_upward" : "arrow_downward"}
                                 </div>
                              ) : null}
                           </div>
                        </th>
                        <th
                           className="pointer"
                           onClick={() => {
                              playerTradesSortingState.column = "sellAmount";
                              playerTradesSortingState.asc = !playerTradesSortingState.asc;
                              forceUpdate();
                           }}
                        >
                           {playerTradesSortingState.column === "sellAmount" ? (
                              <div className="m-icon small">
                                 {playerTradesSortingState.asc ? "arrow_upward" : "arrow_downward"}
                              </div>
                           ) : null}
                        </th>
                        <th
                           className="pointer"
                           onClick={() => {
                              playerTradesSortingState.column = "difference";
                              playerTradesSortingState.asc = !playerTradesSortingState.asc;
                              forceUpdate();
                           }}
                        >
                           {playerTradesSortingState.column === "difference" ? (
                              <div className="m-icon small">
                                 {playerTradesSortingState.asc ? "arrow_upward" : "arrow_downward"}
                              </div>
                           ) : null}
                        </th>
                        <th
                           className="pointer"
                           onClick={() => {
                              playerTradesSortingState.column = "tradeProfit";
                              playerTradesSortingState.asc = !playerTradesSortingState.asc;
                              forceUpdate();
                           }}
                        >
                           {playerTradesSortingState.column === "tradeProfit" ? (
                              <div className="m-icon small">
                                 {playerTradesSortingState.asc ? "arrow_upward" : "arrow_downward"}
                              </div>
                           ) : null}
                        </th>
                        <th>{$t(L.PlayerTradeFrom)}</th>
                        <th
                           className="pointer"
                           onClick={() => {
                              playerTradesSortingState.column = "from";
                              playerTradesSortingState.asc = !playerTradesSortingState.asc;
                              forceUpdate();
                           }}
                        >
                           {playerTradesSortingState.column === "from" ? (
                              <div className="m-icon small">
                                 {playerTradesSortingState.asc ? "arrow_upward" : "arrow_downward"}
                              </div>
                           ) : null}
                        </th>
                        <th></th>
                     </tr>
                  );
               }}
               itemContent={(index, trade) => {
                  return (
                     <PlayerTradeTableRow
                        index={index}
                        trade={trade}
                        showModal={showModal}
                        hideModal={hideModal}
                     />
                  );
               }}
            />
         </div>
      </>
   );
}

function PlayerTradeTableRow({
   trade,
   index,
   showModal,
   hideModal,
}: {
   trade: IClientTrade;
   index: number;
   showModal: (modal: React.ReactNode) => void;
   hideModal: () => void;
}): React.ReactNode {
   const user = useUser();
   const gameState = useGameState();
   const disableFill = user === null || trade.fromId === user.userId;
   const percentage = getTradePercentage(trade);
   const tradeProfig = (trade.sellAmount * (Config.MaterialPrice[trade.sellResource] ?? 0) - trade.buyAmount * (Config.MaterialPrice[trade.buyResource] ?? 0));
   const hasResource = hasResourceForPlayerTrade(trade.buyResource);
   let evenodd = index % 2 === 0 ? "white" : "grey";
   if (trade.fromId === user?.userId) {
      evenodd = "blue";
   }
   return (
      <>
         <td className={cls(hasResource ? "text-strong" : null, evenodd)}>
            {Config.Material[trade.buyResource].name()}
         </td>
         <td className={cls("text-right", hasResource ? "text-strong" : null, evenodd)}>
            <FormatNumber value={trade.buyAmount} />
         </td>
         <td className={evenodd}>{Config.Material[trade.sellResource].name()}</td>
         <td className={cls("text-right", evenodd)}>
            <FormatNumber value={trade.sellAmount} />
         </td>
         <td
            className={classNames({
               [evenodd]: true,
               "text-right": true,
               "text-red": percentage <= -CURRENCY_PERCENT_EPSILON,
               "text-green": percentage >= CURRENCY_PERCENT_EPSILON,
               "text-desc": Math.abs(percentage) < CURRENCY_PERCENT_EPSILON,
            })}
         >
            <Tippy content={$t(L.MarketValueDesc, { value: formatPercent(percentage, 0) })}>
               <div>
                  {mathSign(percentage, CURRENCY_PERCENT_EPSILON)}
                  {formatPercent(Math.abs(percentage), 0)}
               </div>
            </Tippy>
         </td>
         <td
            className={classNames({
               [evenodd]: true,
               "text-right": true,
               "text-red": tradeProfig < 0,
               "text-green": tradeProfig > 0,
            })}
         >
            <FormatNumber value={tradeProfig} />
         </td>
         <td className={evenodd}>
            <div className="row">
               <Tippy content={getCountryName(trade.fromFlag)}>
                  <PlayerFlagComponent name={trade.fromFlag} scale={0.7} />
               </Tippy>
               {trade.fromLevel > 0 ? (
                  <Tippy content={AccountLevelNames[trade.fromLevel]()}>
                     <AccountLevelComponent level={trade.fromLevel} scale={0.17} />
                  </Tippy>
               ) : null}
               {hasFlag(trade.fromAttr, UserAttributes.DLC1) ? (
                  <Tippy content={$t(L.AccountSupporter)}>
                     <MiscTextureComponent name="Supporter" scale={0.17} />
                  </Tippy>
               ) : null}
            </div>
         </td>
         <td className={evenodd}>
            <FixedLengthText text={trade.from} length={16} />
         </td>
         <td className={evenodd}>
            {trade.fromId === user?.userId ? (
               <div
                  className="m-icon small text-link"
                  onClick={() => {
                     const availableStorage = getAvailableStorage(
                        Array.from(Tick.current.playerTradeBuildings.keys()),
                        gameState,
                     );
                     let storageOverflow = trade.sellAmount * TRADE_CANCEL_REFUND_PERCENT - availableStorage;
                     if (storageOverflow <= 0) {
                        storageOverflow = 0;
                     }
                     showModal(
                        <ConfirmModal
                           title={$t(L.PlayerTradeCancelTrade)}
                           hideModalFunc={hideModal}
                           onConfirm={async () => {
                              try {
                                 const cancelledTrade = await client.cancelTrade(trade.id);
                                 addResourceTo(
                                    cancelledTrade.sellResource,
                                    cancelledTrade.sellAmount * TRADE_CANCEL_REFUND_PERCENT,
                                    Array.from(Tick.current.playerTradeBuildings.keys()),
                                    gameState,
                                 );
                                 gameState.tradeProfit += cancelledTrade.sellAmount * TRADE_CANCEL_REFUND_PERCENT * (Config.MaterialPrice[cancelledTrade.sellResource] ?? 0);
                                 playKaching();
                              } catch (error) {
                                 showToast(String(error));
                                 playError();
                              }
                           }}
                        >
                           <RenderHTML
                              html={$t(L.PlayerTradeCancelDescHTML, {
                                 percent: formatPercent(1 - TRADE_CANCEL_REFUND_PERCENT),
                                 res: `${formatNumber(
                                    trade.sellAmount * TRADE_CANCEL_REFUND_PERCENT,
                                 )} ${Config.Material[trade.sellResource].name()}`,
                                 discard: formatNumber(storageOverflow),
                              })}
                           />
                        </ConfirmModal>,
                     );
                  }}
               >
                  delete
               </div>
            ) : (
               <div
                  className={classNames({
                     "text-link": !disableFill,
                     "text-strong": true,
                     "text-desc": disableFill,
                  })}
                  onClick={() => {
                     if (!disableFill) {
                        showModal(<FillPlayerTradeModal hideModal={hideModal} tradeId={trade.id} />);
                     }
                  }}
               >
                  {$t(L.PlayerTradeFill)}
               </div>
            )}
         </td>
      </>
   );
}

function PlayerTradeFilterModal({
   hideModal,
   resources,
   applyFilters,
}: { hideModal: () => void; resources: Material[]; applyFilters: () => void }): React.ReactNode {
   const forceUpdate = useForceUpdate();
   const trades = useTrades();
   const flags = new Set<string>();
   trades.forEach((t) => flags.add(t.fromFlag));
   // 2026-05-30 Added by Lydia
   applyFilters();
   return (
      <div className="window" style={{ width: 500 }}>
         <div className="title-bar">
            <div className="title-bar-text">{$t(L.PlayerTradeFilters)}</div>
            <div className="title-bar-controls">
               <button onClick={hideModal} aria-label="Close"></button>
            </div>
         </div>
         <div className="window-body">
            <div className="row g10" style={{ alignItems: "stretch", height: 450 }}>
               <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                  <div>{$t(L.PlayerTradePlayerNameFilter)}</div>
                  <input
                     className="w100"
                     type="text"
                     size={1}
                     value={getGameOptions().tradeFilters.savedPlayerNameFilter}
                     onChange={(e) => {
                        getGameOptions().tradeFilters.savedPlayerNameFilter = e.target.value;
                        forceUpdate();
                        applyFilters();
                     }}
                     onClick={(e) => (e.target as HTMLInputElement)?.select()}
                  />
                  <div className="sep5" />
                  <div>{$t(L.PlayerTradePlayerBanNameFilter)}</div>
                  <input
                     className="w100"
                     type="text"
                     size={1}
                     value={getGameOptions().tradeFilters.savedPlayerBanNameFilter}
                     onChange={(e) => {
                        getGameOptions().tradeFilters.savedPlayerBanNameFilter = e.target.value;
                        forceUpdate();
                        applyFilters();
                     }}
                     onClick={(e) => (e.target as HTMLInputElement)?.select()}
                  />
                  <div className="sep5" />
                  <div>{$t(L.PlayerTradeMaxTradeAmountFilter)}</div>
                  <div>
                     <input
                        type="text"
                        className="w100"
                        size={1}
                        value={getGameOptions().tradeFilters.savedMaxTradeAmountFilter}
                        onChange={(e) => {
                           getGameOptions().tradeFilters.savedMaxTradeAmountFilter = safeParseInt(e.target.value, 0);
                           forceUpdate();
                           applyFilters();
                        }}
                        onClick={(e) => (e.target as HTMLInputElement)?.select()}
                     />
                  </div>
                  <div className="row">
                     <div className="f1">
                        <button className="f1" onClick={(e) => { getGameOptions().tradeFilters.savedMaxTradeAmountFilter = 1e6; forceUpdate(); applyFilters(); }}>
                           1M
                        </button>
                        <button className="f1" onClick={(e) => { getGameOptions().tradeFilters.savedMaxTradeAmountFilter = 1e8; forceUpdate(); applyFilters(); }}>
                           100M
                        </button>
                        <button className="f1" onClick={(e) => { getGameOptions().tradeFilters.savedMaxTradeAmountFilter = 1e10; forceUpdate(); applyFilters(); }}>
                           10B
                        </button>
                        <button className="f1" onClick={(e) => { getGameOptions().tradeFilters.savedMaxTradeAmountFilter = 1e12; forceUpdate(); applyFilters(); }}>
                           1T
                        </button>
                        <button className="f1" onClick={(e) => { getGameOptions().tradeFilters.savedMaxTradeAmountFilter = 1e13; forceUpdate(); applyFilters(); }}>
                           10T
                        </button>
                     </div>
                  </div>
                  <div className="sep5" />
                  <div>{$t(L.PlayerTradePercentageFilter)}</div>
                  <div>
                     <input
                        type="text"
                        className="w100"
                        size={5}
                        value={getGameOptions().tradeFilters.savedTradePercentageFilter}
                        onChange={(e) => {
                           getGameOptions().tradeFilters.savedTradePercentageFilter = safeParseInt(e.target.value, 0);
                           forceUpdate();
                           applyFilters();
                        }}
                        onClick={(e) => (e.target as HTMLInputElement)?.select()}
                     />
                  </div>

                  <div className="sep5" />
                  <div>{$t(L.AccountLevel)}</div>
                  <div className="row">
                     {mapOf(AccountLevelNames, (level, name) => {
                        return (
                           <button
                              className={cls("f1 p0", getGameOptions().tradeFilters.savedAccountRanks.has(level) ? "active" : null)}
                              onClick={() => {
                                 if (getGameOptions().tradeFilters.savedAccountRanks.has(level)) {
                                    getGameOptions().tradeFilters.savedAccountRanks.delete(level);
                                 } else {
                                    getGameOptions().tradeFilters.savedAccountRanks.add(level);
                                 }
                                 applyFilters();
                                 forceUpdate();
                              }}
                           >
                              {numberToRoman(Number.parseInt(level, 10) + 1)}
                           </button>
                        );
                     })}
                  </div>
                  <div className="sep5"></div>
                  <div>{$t(L.PlayerTradeFlagFilter)}</div>
                  <div
                     className="inset-shallow white f1"
                     style={{
                        overflowY: "auto",
                     }}
                  >
                     <div style={{ display: "grid", gridTemplateColumns: "repeat(9, 1fr)" }}>
                        {Array.from(flags).map((flag) => {
                           return (
                              <Tippy key={flag} content={getCountryName(flag)}>
                                 <div
                                    className="row jcc pointer"
                                    style={{
                                       backgroundColor: getGameOptions().tradeFilters.savedPlayerFlags.has(flag)
                                          ? "#00289e"
                                          : "transparent",
                                    }}
                                    onClick={() => {
                                       if (getGameOptions().tradeFilters.savedPlayerFlags.has(flag)) {
                                          getGameOptions().tradeFilters.savedPlayerFlags.delete(flag);
                                       } else {
                                          getGameOptions().tradeFilters.savedPlayerFlags.add(flag);
                                       }
                                       applyFilters();
                                       forceUpdate();
                                    }}
                                 >
                                    <PlayerFlagComponent name={flag} scale={0.7} />
                                 </div>
                              </Tippy>
                           );
                        })}
                     </div>
                  </div>
               </div>
               <div style={{ flex: 1 }}>
                  <div className="table-view sticky-header" style={{ overflowY: "auto", height: 300 }}>
                     <table>
                        <thead>
                           <tr>
                              <th>{$t(L.PlayerTradeResource)}</th>
                              <th>{$t(L.PlayerTradeWant)}</th>
                              <th>{$t(L.PlayerTradeOffer)}</th>
                           </tr>
                        </thead>
                        <tbody>
                           {resources
                              .sort((a, b) =>
                                 Config.Material[a].name().localeCompare(Config.Material[b].name()),
                              )
                              .map((res) => (
                                 <tr key={res}>
                                    <td>{Config.Material[res].name()}</td>
                                    <td
                                       style={{ width: 0 }}
                                       className="text-strong"
                                       onClick={() => {
                                          if (getGameOptions().tradeFilters.savedResourceWantFilters.has(res)) {
                                             getGameOptions().tradeFilters.savedResourceWantFilters.delete(res);
                                          } else {
                                             getGameOptions().tradeFilters.savedResourceWantFilters.add(res);
                                          }
                                          forceUpdate();
                                          applyFilters();
                                       }}
                                    >
                                       {getGameOptions().tradeFilters.savedResourceWantFilters.has(res) ? (
                                          <div className="m-icon small text-blue">check_box</div>
                                       ) : (
                                          <div className="m-icon small text-desc">
                                             check_box_outline_blank
                                          </div>
                                       )}
                                    </td>
                                    <td
                                       style={{ width: 0 }}
                                       className="text-strong"
                                       onClick={() => {
                                          if (getGameOptions().tradeFilters.savedResourceOfferFilters.has(res)) {
                                             getGameOptions().tradeFilters.savedResourceOfferFilters.delete(res);
                                          } else {
                                             getGameOptions().tradeFilters.savedResourceOfferFilters.add(res);
                                          }
                                          forceUpdate();
                                          applyFilters();
                                       }}
                                    >
                                       {getGameOptions().tradeFilters.savedResourceOfferFilters.has(res) ? (
                                          <div className="m-icon small text-blue">check_box</div>
                                       ) : (
                                          <div className="m-icon small text-desc">
                                             check_box_outline_blank
                                          </div>
                                       )}
                                    </td>
                                 </tr>
                              ))}
                        </tbody>
                     </table>
                  </div>
               </div>
            </div>
            <div className="row mt10">
               <button
                  className="f1 text-center"
                  onClick={() => {
                     clearSavedFilters();
                     forceUpdate();
                     applyFilters();
                     hideModal();
                  }}
               >
                  {$t(L.PlayerTradeFiltersClear)}
               </button>
               <button
                  className="f1 text-center text-strong"
                  onClick={() => {
                     forceUpdate();
                     applyFilters();
                     hideModal();
                  }}
               >
                  {$t(L.PlayerTradeFiltersApply)}
               </button>
            </div>
         </div>
      </div>
   );
}
