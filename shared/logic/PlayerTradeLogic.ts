import type { Resource } from "../definitions/ResourceDefinitions";
import {
   AccountLevel,
   IClientMapEntry,
   TradeTileReservationDays,
   type IAddTradeRequest,
   type IUser,
} from "../utilities/Database";
import { DAY } from "../utilities/Helper";
import { Config } from "./Config";

export interface IClientAddTradeRequest extends IAddTradeRequest {
   buyResource: Resource;
   sellResource: Resource;
}

export function getBuyAmountRange(trade: IClientAddTradeRequest, user: IUser | null): [number, number] {
   const amount =
      (trade.sellAmount * (Config.ResourcePrice[trade.sellResource] ?? 0)) /
      (Config.ResourcePrice[trade.buyResource] ?? 0);
   const range = user ? getUserTradePriceRange(user) : 0.05;
   return [Math.round(amount * (1 - range)), Math.round(amount * (1 + range))];
}

export function getUserTradePriceRange(user: IUser): number {
   switch (user.level) {
      case AccountLevel.Quaestor:
         return 0.1;
      case AccountLevel.Aedile:
         return 0.15;
      case AccountLevel.Praetor:
         return 0.2;
      case AccountLevel.Consul:
         return 0.25;
      default:
         return 0.05;
   }
}

export function getMaxActiveTrades(user: IUser): number {
   switch (user.level) {
      case AccountLevel.Quaestor:
         return 4;
      case AccountLevel.Aedile:
         return 6;
      case AccountLevel.Praetor:
         return 8;
      case AccountLevel.Consul:
         return 10;
      default:
         return 2;
   }
}

export function getTradePercentage(trade: IAddTradeRequest): number {
   const standardAmount =
      (trade.buyAmount * Config.ResourcePrice[trade.buyResource]!) /
      Config.ResourcePrice[trade.sellResource]!;
   return (trade.sellAmount - standardAmount) / standardAmount;
}

export function isTileReserved(entry: Pick<IClientMapEntry, "lastSeenAt" | "level">): boolean {
   return Date.now() - entry.lastSeenAt <= TradeTileReservationDays[entry.level] * DAY;
}
