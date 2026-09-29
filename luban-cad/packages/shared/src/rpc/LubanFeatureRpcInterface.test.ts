import { describe, expect, it } from "vitest";
import { LubanFeatureRpcInterface } from "./LubanFeatureRpcInterface.js";

describe("LubanFeatureRpcInterface", () => {
  it("接口名与版本固定", () => {
    expect(LubanFeatureRpcInterface.interfaceName).toBe("luban-cad/features-v1");
    expect(LubanFeatureRpcInterface.interfaceVersion).toBe("1.0.0");
  });
});
