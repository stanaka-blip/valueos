import assert from "node:assert/strict";

import {
  buildCaseRegistrationConstructionDetail,
  buildConstructionDetailForEdit,
  parseConstructionDetailForEdit,
} from "./caseRegistrationExtras";

function ok(name: string) {
  console.log("OK", name);
}

{
  const built = buildCaseRegistrationConstructionDetail({
    contractor_name: "山田設備",
  });
  assert.equal(built, "【施工店名】山田設備");
  const parsed = parseConstructionDetailForEdit(built);
  assert.equal(parsed.contractor_name, "山田設備");
  assert.equal(parsed.construction_body, "");
  ok("registration-style construction_detail round-trip");
}

{
  const previous =
    "【施工店名】旧店\n【施工店担当者】田中\n【施工店電話番号】090-1111-2222\n屋根工事あり";
  const parsed = parseConstructionDetailForEdit(previous);
  assert.equal(parsed.contractor_name, "旧店");
  assert.equal(parsed.construction_body, "屋根工事あり");

  const next = buildConstructionDetailForEdit({
    contractor_name: "新店",
    construction_body: "外壁補修",
    previous_detail: previous,
  });
  assert.equal(
    next,
    "【施工店名】新店\n【施工店担当者】田中\n【施工店電話番号】090-1111-2222\n外壁補修"
  );
  ok("edit preserves dealer contact/phone labels");
}

{
  const next = buildConstructionDetailForEdit({
    contractor_name: "",
    construction_body: "内容のみ",
    previous_detail: "【施工店名】消したい",
  });
  assert.equal(next, "内容のみ");
  ok("clearing contractor name removes label");
}

{
  assert.equal(buildConstructionDetailForEdit({
    contractor_name: "  ",
    construction_body: "  ",
    previous_detail: null,
  }), null);
  ok("empty edit yields null");
}

console.log("caseRegistrationExtras.constructionEdit.test.ts passed");
