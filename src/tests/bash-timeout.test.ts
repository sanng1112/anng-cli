import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clampBashTimeoutMs,
  DEFAULT_BASH_TIMEOUT_MS,
  MIN_BASH_TIMEOUT_MS,
  BASH_TIMEOUT_INCREMENT_MS,
  BASH_TIMEOUT_DECREMENT_MS,
} from "../common/bash-timeout";

describe("bash-timeout constants", () => {
  it("DEFAULT_BASH_TIMEOUT_MS is 10 minutes", () => {
    assert.equal(DEFAULT_BASH_TIMEOUT_MS, 10 * 60 * 1000);
  });

  it("MIN_BASH_TIMEOUT_MS is 1 minute", () => {
    assert.equal(MIN_BASH_TIMEOUT_MS, 60 * 1000);
  });

  it("BASH_TIMEOUT_INCREMENT_MS is 5 minutes", () => {
    assert.equal(BASH_TIMEOUT_INCREMENT_MS, 5 * 60 * 1000);
  });

  it("BASH_TIMEOUT_DECREMENT_MS is 1 minute", () => {
    assert.equal(BASH_TIMEOUT_DECREMENT_MS, 60 * 1000);
  });
});

describe("clampBashTimeoutMs", () => {
  it("returns default for NaN", () => {
    assert.equal(clampBashTimeoutMs(NaN), DEFAULT_BASH_TIMEOUT_MS);
  });

  it("returns default for Infinity", () => {
    assert.equal(clampBashTimeoutMs(Infinity), DEFAULT_BASH_TIMEOUT_MS);
  });

  it("returns default for -Infinity", () => {
    assert.equal(clampBashTimeoutMs(-Infinity), DEFAULT_BASH_TIMEOUT_MS);
  });

  it("clamps below minimum", () => {
    assert.equal(clampBashTimeoutMs(500), MIN_BASH_TIMEOUT_MS);
    assert.equal(clampBashTimeoutMs(0), MIN_BASH_TIMEOUT_MS);
    assert.equal(clampBashTimeoutMs(-1000), MIN_BASH_TIMEOUT_MS);
  });

  it("passes through valid values", () => {
    assert.equal(clampBashTimeoutMs(120000), 120000);
    assert.equal(clampBashTimeoutMs(300000), 300000);
    assert.equal(clampBashTimeoutMs(600000), 600000);
  });

  it("respects custom minimum", () => {
    assert.equal(clampBashTimeoutMs(5000, 10000), 10000);
    assert.equal(clampBashTimeoutMs(15000, 10000), 15000);
  });

  it("rounds non-integer values", () => {
    const result = clampBashTimeoutMs(120000.7, MIN_BASH_TIMEOUT_MS);
    assert.equal(result, 120001);
  });
});
