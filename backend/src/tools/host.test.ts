import { describe, expect, it } from "vitest";
import { addresses, cmdSafe, formatEnv, layout, newConfig, optionsOf, parsePort, readEnv, runInstallerCmd, runUpdaterCmd, taskXml, updatePaths, utf16, withOptions, withServerSettings } from "./host";

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

describe("automatic update scripts", () => {
  const dir = "C:\\ProgramData\\EZI\\update";
  const node = "C:\\Program Files\\EZI\\node\\node.exe";
  const cli = "C:\\Program Files\\EZI\\app\\cli.mjs";

  it("the update round waits while an installer works, then runs the CLI", () => {
    const cmd = runUpdaterCmd(node, cli, dir);
    expect(cmd).toContain("installing.flag");
    expect(cmd).toContain("installer-exit.txt");
    expect(cmd.indexOf("exit 1")).toBeLessThan(cmd.indexOf("auto-update")); // the wait comes before anything from the program folder starts
    expect(cmd).toContain(`"${node}" "${cli}" auto-update`);
    expect(cmd).toContain("\r\n");
  });

  it("the installer script runs it silently, waits, and writes the exit code", () => {
    const cmd = runInstallerCmd(`${dir}\\EZI-Setup-1.2.1.exe`, "C:\\ProgramData\\EZI\\logs\\update-setup.log", dir);
    expect(cmd).toContain('start "" /wait "C:\\ProgramData\\EZI\\update\\EZI-Setup-1.2.1.exe" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP- /NOCANCEL');
    expect(cmd).toContain(`>"${updatePaths(dir).exit}" echo %errorlevel%`);
    expect(cmd.indexOf("start ")).toBeLessThan(cmd.indexOf("echo %errorlevel%"));
  });

  it("refuses a path that could change what the script does", () => {
    for (const bad of ['C:\\x" & calc', "C:\\100%\\x", "C:\\a'b", "C:\\$env", "C:\\a|b"]) expect(() => cmdSafe(bad), bad).toThrow();
    expect(() => runInstallerCmd('C:\\x" & calc', "log", dir)).toThrow();
    expect(() => runUpdaterCmd(node, cli, 'C:\\a" b')).toThrow();
  });

  it("the tasks run as SYSTEM, once at a time; only the updater repeats", () => {
    const repeating = taskXml(updatePaths(dir).runUpdater, { description: "EZI automatic update", repeatMinutes: 5, timeLimit: "PT1H" });
    expect(repeating).toContain("<UserId>S-1-5-18</UserId>");
    expect(repeating).toContain("<Interval>PT5M</Interval>");
    expect(repeating).toContain("<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>");
    expect(repeating).toContain('<Arguments>/c ""C:\\ProgramData\\EZI\\update\\run-updater.cmd""</Arguments>');
    const onDemand = taskXml(updatePaths(dir).runInstaller, { description: "EZI installs an update", timeLimit: "PT1H" });
    expect(onDemand).toContain("<Triggers />");
    expect(onDemand).not.toContain("Repetition");
  });

  it("writes the task file as UTF-16 with a byte order mark", () => {
    const b = utf16("<a/>");
    expect([b[0], b[1]]).toEqual([0xff, 0xfe]);
    expect(b.subarray(2).toString("utf16le")).toBe("<a/>");
  });
});
