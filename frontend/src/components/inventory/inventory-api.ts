import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getToken } from "@/lib/api";
import { useSocketEvent } from "@/lib/socket";
import { addDays } from "@/components/patients/patients-api";

export const PRODUCT_TYPES = [
  "Tablet",
  "Capsule",
  "Oil",
  "Shampoo",
  "Conditioner",
  "Serum",
  "Solution",
  "Lotion",
  "Cream",
  "Gel",
  "Spray",
  "Supplement",
  "Other",
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

/** A product the clinic stocks. `id` is its SKU or barcode (fixed once added). */
export type InventoryItem = {
  id: string;
  name: string;
  company: string;
  type: ProductType;
  stockQuantity: number;
  reorderLevel: number;
  /** INR per unit, up to 2 decimals. */
  costPrice: number;
  sellingPrice: number;
  batchNo: string;
  /** YYYY-MM-DD */
  expiryDate: string;
  imageUrl?: string | null;
};

/** Create body: the SKU is sent as `itemId` and becomes the item's id. */
export type InventoryInput = Omit<InventoryItem, "id"> & { itemId: string };

/** Items expiring within this many days are flagged. */
export const EXPIRY_WARNING_DAYS = 90;

export type StockState = "out" | "low" | "ok";
export type ExpiryState = "expired" | "soon" | "ok";

export function stockState(item: InventoryItem): StockState {
  if (item.stockQuantity === 0) return "out";
  return item.stockQuantity <= item.reorderLevel ? "low" : "ok";
}

/** A product can be used up to and including its expiry date. */
export function expiryState(item: InventoryItem, today: string): ExpiryState {
  if (item.expiryDate < today) return "expired";
  return item.expiryDate <= addDays(today, EXPIRY_WARNING_DAYS) ? "soon" : "ok";
}

/** ₹650 or ₹62.50 — prices keep paise when they have them. */
export const inrPrice = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function useInventory() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["inventory"],
    queryFn: () => api<InventoryItem[]>("/inventory"),
    retry: 1,
  });
  // Keep every open screen in sync when anyone restocks or sells.
  const refresh = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: ["inventory"] }),
    [queryClient],
  );
  const live = getToken() !== null;
  useSocketEvent("inventory.created", refresh, live);
  useSocketEvent("inventory.updated", refresh, live);
  useSocketEvent("inventory.deleted", refresh, live);
  return query;
}

export function useInventoryMutations() {
  const queryClient = useQueryClient();
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: ["inventory"] });
  const create = useMutation({
    mutationFn: (body: InventoryInput) =>
      api<InventoryItem>("/inventory", { method: "POST", body: JSON.stringify(body) }),
    onSuccess,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Omit<InventoryItem, "id">> }) =>
      api<InventoryItem>(`/inventory/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess,
  });
  const adjust = useMutation({
    mutationFn: ({ id, change }: { id: string; change: number }) =>
      api<InventoryItem>(`/inventory/${encodeURIComponent(id)}/stock`, {
        method: "POST",
        body: JSON.stringify({ change }),
      }),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api<void>(`/inventory/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess,
  });
  return { create, update, adjust, remove };
}
