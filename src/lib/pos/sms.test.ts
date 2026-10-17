import assert from "node:assert/strict";
import test from "node:test";
import { cloneSettings } from "@/lib/pos/seed.ts";
import { formatIsraeliMobile, matchClubMember, normalizeIsraeliMobile } from "@/lib/pos/phone.ts";
import { isReceiptToken, newReceiptToken, receiptSmsBody, receiptUrl, toPublicSale } from "@/lib/pos/receipt-link.ts";
import { activeSmsProvider, serverSmsProvider } from "@/lib/pos/sms.ts";
import type { Sale } from "@/lib/pos/types.ts";

function sale(): Sale {
  const settings = cloneSettings();
  return {
    id: "sale-1",
    number: 12,
    createdAt: "2026-04-02T10:30:00.000Z",
    lines: [{ productId: null, name: "קפה", unitPrice: 10, qty: 1, lineTotal: 10 }],
    discountAmount: 0,
    total: 20,
    vatRate: 18,
    vatAmount: 3.05,
    net: 16.95,
    method: "cash",
    tenders: [
      { method: "cash", amount: 10, tendered: 10, change: 0, rounding: 0 },
      { method: "card", amount: 10, tendered: 10, change: 0, rounding: 0 },
    ],
    amountDue: 20,
    rounding: 0,
    tendered: 20,
    change: 0,
    voided: false,
    zId: null,
    cashierName: "נועה",
    business: settings,
    publicToken: "abcdefghij1234567890AB",
  };
}

test("Israeli mobile numbers normalize to +972", () => {
  assert.equal(normalizeIsraeliMobile("052-1234567"), "+972521234567");
  assert.equal(normalizeIsraeliMobile("0521234567"), "+972521234567");
  assert.equal(normalizeIsraeliMobile("052 123 4567"), "+972521234567");
  assert.equal(normalizeIsraeliMobile("+972521234567"), "+972521234567");
  assert.equal(normalizeIsraeliMobile("972521234567"), "+972521234567");
  assert.equal(normalizeIsraeliMobile("+972-052-1234567"), "+972521234567");
  assert.equal(formatIsraeliMobile("+972521234567"), "052-1234567");
  assert.equal(normalizeIsraeliMobile("03-5551234"), null);
  assert.equal(normalizeIsraeliMobile("052-123456"), null);
  assert.equal(normalizeIsraeliMobile("05X-XXXXXXX"), null);
  assert.equal(normalizeIsraeliMobile(""), null);
});

test("a matching club phone can be found from any accepted format", () => {
  const member = { id: "m1", firstName: "דנה", lastName: "אביב", phone: "052-1234567", note: "", active: true };
  assert.equal(matchClubMember([member], "+972521234567")?.id, "m1");
  assert.equal(matchClubMember([{ ...member, active: false }], "+972521234567"), null);
  assert.equal(matchClubMember([member], "+972501111111"), null);
});

test("SMS summary includes the receipt link only after sync", () => {
  const body = receiptSmsBody(sale(), null);
  assert.match(body, /מכולת השכונה/);
  assert.match(body, /קבלה 12/);
  assert.match(body, /מזומן, אשראי/);
  assert.equal(body.includes("http"), false);
  const linked = receiptSmsBody(sale(), receiptUrl("abcdefghij1234567890AB"));
  assert.match(linked, /סה״כ/);
  assert.ok(linked.endsWith("https://liitpos.vercel.app/r/abcdefghij1234567890AB"));
  const credit = receiptSmsBody({ ...sale(), kind: "credit", number: 3 }, null);
  assert.match(credit, /תעודת זיכוי 3/);
});

test("receipt tokens are unguessable and the public sale drops the token", () => {
  const token = newReceiptToken();
  assert.equal(isReceiptToken(token), true);
  assert.equal(token.length >= 22, true);
  assert.notEqual(newReceiptToken(), token);
  const pub = toPublicSale({ ...sale(), publicToken: token, secret: "nope" });
  assert.ok(pub);
  assert.equal("publicToken" in (pub ?? {}), false);
  assert.equal((pub as { secret?: string }).secret, undefined);
  assert.equal(pub?.business.businessName, "מכולת השכונה");
  assert.equal(toPublicSale({ id: "x" }), null);
});

test("the active SMS sender is the device composer", async () => {
  assert.equal(activeSmsProvider().name, "device");
  await assert.rejects(() => serverSmsProvider.send({ to: "+972521234567", body: "שלום", saleId: "sale-1" }), /לא הוגדר/);
});
