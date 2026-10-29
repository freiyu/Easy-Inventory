import { describe, expect, it } from "vitest";
import { addresses, formatEnv, layout, newConfig, optionsOf, parsePort, readEnv, withOptions, withServerSettings } from "./host";

const l = layout("C:\\Program Files\\EZI", "C:\\ProgramData\\EZI");

describe("installer config", () => {
  it("writes Windows paths that read back unchanged", () => {
    const config = newConfig(l, { port: 3000, lan: true, autostart: true }, "abc123", "s3cr3t");
    expect(readEnv(formatEnv(config))).toEqual(config);
    expect(config.MYSQLDUMP_PATH).toBe("C:\\Program Files\\EZI\\mariadb\\bin\\mariadb-dump.exe");
    expect(config.DATABASE_URL).toBe("mysql://ezi:abc123@127.0.0.1:3307/ezi");
  });

  it("listens on the LAN only when the option is on (PRD 2.4)", () => {
    expect(withOptions({}, { port: 3000, lan: true, autostart: true }).HOST).toBe("0.0.0.0");
    const off = withOptions({ SESSION_SECRET: "x" }, { port: 8080, lan: false, autostart: false });
    expect(off).toMatchObject({ HOST: "127.0.0.1", PORT: "8080", SESSION_SECRET: "x" });
    expect(optionsOf(off)).toEqual({ port: 8080, lan: false, autostart: false });
  });

  it("refuses values that would not read back safely", () => {
    expect(() => formatEnv({ A: "x\ny" })).toThrow();
    expect(() => formatEnv({ A: "has # hash" })).toThrow();
  });

  it("accepts only free-range ports that are not the database port", () => {
    expect(parsePort("3000")).toBe(3000);
    for (const bad of ["80", "3307", "70000", "abc", undefined]) expect(() => parsePort(bad)).toThrow();
  });
});

describe("host helpers", () => {
  it("lists localhost, LAN IPv4 addresses and the computer name", () => {
    const nics = { Ethernet: [{ family: "IPv4", internal: false, address: "192.168.1.20" }, { family: "IPv6", internal: false, address: "fe80::1" }], lo: [{ family: "IPv4", internal: true, address: "127.0.0.1" }] };
    expect(addresses(3000, true, nics, "KANTOR-PC")).toEqual(["http://localhost:3000", "http://192.168.1.20:3000", "http://KANTOR-PC:3000"]);
    expect(addresses(3000, false, nics, "KANTOR-PC")).toEqual(["http://localhost:3000"]);
  });

  it("puts server settings under [mysqld] and replaces old values", () => {
    const ini = "[mysqld]\r\ndatadir=C:/x\r\nport=3307\r\nbind-address=0.0.0.0\r\n[client]\r\nport=3307";
    expect(withServerSettings(ini, ["bind-address=127.0.0.1"])).toBe("[mysqld]\r\nbind-address=127.0.0.1\r\ndatadir=C:/x\r\nport=3307\r\n[client]\r\nport=3307");
  });
});
