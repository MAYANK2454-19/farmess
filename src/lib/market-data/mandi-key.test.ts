import assert from "node:assert/strict";
import test from "node:test";

import { mandiKey } from "./mandi-key.ts";

test("renamed AGMARKNET mandis share one key", () => {
  const narwal = mandiKey("Narwal Jammu (F&V) APMC", "Jammu");
  assert.equal(mandiKey("Narwal Jammu (F&V)", "Jammu"), narwal);
  assert.equal(mandiKey("MAC F&V Market Narwal Jammu", "Jammu"), narwal);

  const udhampur = mandiKey("Udhampur APMC", "Udhampur");
  assert.equal(mandiKey("Udhampur (F&V)", "Udhampur"), udhampur);
  assert.equal(mandiKey("Fruit and Vegetable Market Udhampur", "Udhampur"), udhampur);

  assert.equal(
    mandiKey("Parimpore APMC", "Srinagar"),
    mandiKey("Parimpore Srinagar (F&V)", "Srinagar"),
  );
  assert.equal(
    mandiKey("Batingoo APMC", "Anantnag"),
    mandiKey("Batengoo Anantnag (F&V)", "Anantnag"),
  );
});

test("different mandis keep different keys", () => {
  assert.notEqual(mandiKey("Pune(Manjri)", "Pune"), mandiKey("Pune(Pimpri)", "Pune"));
  assert.notEqual(mandiKey("Kathua (F&V)", "Kathua"), mandiKey("Udhampur (F&V)", "Udhampur"));
  assert.notEqual(mandiKey("Narwal Jammu (F&V)", "Jammu"), mandiKey("Kathua (F&V)", "Kathua"));
});
