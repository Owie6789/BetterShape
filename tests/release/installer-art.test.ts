import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const installerDir = path.join(root, "src-tauri", "installer");

type GifFrame = {
    delay: number;
    disposal: number;
    transparent: boolean;
};

function parseGif(buffer: Buffer) {
    const signature = buffer.subarray(0, 6).toString("ascii");
    const width = buffer.readUInt16LE(6);
    const height = buffer.readUInt16LE(8);
    const packed = buffer[10];
    let offset = 13;
    if (packed & 0x80) {
        offset += 3 * (1 << ((packed & 0x07) + 1));
    }

    const frames: GifFrame[] = [];
    let loop: number | null = null;
    let pendingDelay = 0;
    let pendingDisposal = 0;
    let pendingTransparent = false;

    const readSubBlocks = () => {
        const chunks: Buffer[] = [];
        while (buffer[offset] !== 0) {
            const size = buffer[offset];
            chunks.push(buffer.subarray(offset + 1, offset + 1 + size));
            offset += size + 1;
        }
        offset += 1;
        return Buffer.concat(chunks);
    };

    while (offset < buffer.length) {
        const block = buffer[offset];
        offset += 1;

        if (block === 0x21) {
            const label = buffer[offset];
            offset += 1;

            if (label === 0xf9) {
                const size = buffer[offset];
                expect(size).toBe(4);
                pendingDisposal = (buffer[offset + 1] >> 2) & 0x07;
                pendingDelay = buffer.readUInt16LE(offset + 2);
                pendingTransparent = (buffer[offset + 1] & 0x01) === 1;
                offset += 6;
            } else if (label === 0xff) {
                const size = buffer[offset];
                const identifier = buffer
                    .subarray(offset + 1, offset + 1 + size)
                    .toString("ascii");
                offset += size + 1;
                const data = readSubBlocks();
                if (identifier === "NETSCAPE2.0" && data[0] === 1) {
                    loop = data.readUInt16LE(1);
                }
            } else {
                readSubBlocks();
            }
            continue;
        }

        if (block === 0x2c) {
            expect({
                left: buffer.readUInt16LE(offset),
                top: buffer.readUInt16LE(offset + 2),
                width: buffer.readUInt16LE(offset + 4),
                height: buffer.readUInt16LE(offset + 6),
            }).toEqual({ left: 0, top: 0, width: 164, height: 314 });
            const framePacked = buffer[offset + 8];
            const localTable = (framePacked & 0x80) !== 0;
            const interlaced = (framePacked & 0x40) !== 0;
            expect(interlaced).toBe(false);
            offset += 9;
            if (localTable) {
                offset += 3 * (1 << ((framePacked & 0x07) + 1));
            }
            offset += 1; // LZW minimum code size
            readSubBlocks();
            frames.push({
                delay: pendingDelay,
                disposal: pendingDisposal,
                transparent: pendingTransparent,
            });
            continue;
        }

        if (block === 0x3b) {
            break;
        }

        throw new Error(`unexpected GIF block 0x${block.toString(16)} at ${offset - 1}`);
    }

    return { signature, width, height, frames, loop };
}

function parseBmp(buffer: Buffer) {
    return {
        signature: buffer.subarray(0, 2).toString("ascii"),
        fileSize: buffer.readUInt32LE(2),
        pixelOffset: buffer.readUInt32LE(10),
        headerSize: buffer.readUInt32LE(14),
        width: buffer.readInt32LE(18),
        height: buffer.readInt32LE(22),
        planes: buffer.readUInt16LE(26),
        bitCount: buffer.readUInt16LE(28),
        compression: buffer.readUInt32LE(30),
    };
}

function sha256(buffer: Buffer) {
    return createHash("sha256").update(buffer).digest("hex");
}

const gif = readFileSync(path.join(installerDir, "sidebar.gif"));
const bmp = readFileSync(path.join(installerDir, "sidebar.bmp"));
const dll = readFileSync(path.join(installerDir, "plugins", "x86-unicode", "AnimGif.dll"));
const hooks = readFileSync(path.join(installerDir, "hooks.nsh"), "utf8");
function hookFunction(name: string) {
    const body = new RegExp(`^Function ${name}\\s*$\\n([\\s\\S]*?)^FunctionEnd\\s*$`, "m").exec(
        hooks,
    );
    if (!body) {
        throw new Error(`hooks.nsh does not define Function ${name}`);
    }
    return body[1];
}

function hookCallbacks() {
    return [...hooks.matchAll(/^!define (MUI_PAGE_CUSTOMFUNCTION_\w+) (\S+)\s*$/gm)].map(
        (match) => ({ slot: match[1], target: match[2] }),
    );
}

const config = JSON.parse(
    readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"),
) as {
    bundle: {
        windows: {
            nsis: {
                sidebarImage?: string;
                installerHooks?: string;
            };
        };
    };
};

describe("Windows installer art", () => {
    it("ships a 164x314 animated GIF at 10 fps", () => {
        const parsed = parseGif(gif);
        expect(parsed.signature).toBe("GIF89a");
        expect({ width: parsed.width, height: parsed.height }).toEqual({
            width: 164,
            height: 314,
        });
        expect(parsed.frames).toHaveLength(100);
        expect(parsed.loop).toBe(0);
        expect(parsed.frames.every((frame) => frame.delay === 10)).toBe(true);
        expect(parsed.frames.every((frame) => frame.disposal === 1)).toBe(true);
        expect(parsed.frames.some((frame) => frame.transparent)).toBe(false);
    });

    it("keeps the GIF under the 5 MB repository limit", () => {
        expect(gif.length).toBeLessThan(5 * 1024 * 1024);
    });

    it("ships a 164x314 BMP for the MUI image slot", () => {
        const parsed = parseBmp(bmp);
        expect(parsed.signature).toBe("BM");
        expect(parsed.headerSize).toBe(40);
        expect({ width: parsed.width, height: parsed.height }).toEqual({
            width: 164,
            height: 314,
        });
        expect(parsed.planes).toBe(1);
        expect(parsed.bitCount).toBe(24);
        expect(parsed.compression).toBe(0);
        expect(parsed.fileSize).toBe(bmp.length);
        const stride = (parsed.width * 3 + 3) & ~3;
        expect(parsed.pixelOffset + stride * parsed.height).toBe(bmp.length);
    });

    it("pins the vendored plug-in bytes", () => {
        expect(dll.length).toBe(8704);
        expect(sha256(dll)).toBe(
            "a1fa2e0191f986824f5fc0ef62aee8b4b25695cc56d4b00fecdc1c92f8ea237f",
        );
        expect(sha256(gif)).toBe(
            "19994d877cb2356c0d2d8e6faa87446ab2b19baf7af767b2f0147666ada5640a",
        );
        expect(sha256(bmp)).toBe(
            "f49e79abe7bafedb7a253635c9889dfd0a1a29d389c330ea47f354638c67cd3e",
        );
    });

    it("wires the assets through tauri.conf.json", () => {
        expect(config.bundle.windows.nsis.sidebarImage).toBe("installer/sidebar.bmp");
        expect(config.bundle.windows.nsis.installerHooks).toBe("installer/hooks.nsh");
    });

    it("declares the MUI welcome-page callbacks and defines what they name", () => {
        const callbacks = hookCallbacks();
        expect(callbacks.map((callback) => callback.slot)).toEqual([
            "MUI_PAGE_CUSTOMFUNCTION_SHOW",
            "MUI_PAGE_CUSTOMFUNCTION_LEAVE",
        ]);
        for (const callback of callbacks) {
            expect(hooks).toContain(`Function ${callback.target}`);
        }
    });

    it("plays the GIF into the control it resolved and stops on leave", () => {
        const show = hookFunction("BetterShapeSidebarShow");
        const leave = hookFunction("BetterShapeSidebarLeave");

        // AnimGif must be pointed at the handle FindWindow wrote, and MUI's
        // bitmap must be detached from that same control before playback.
        const target = /AnimGif::play[^\n]*\/HWND=\$(R\d)/.exec(show)?.[1];
        expect(target).toBeDefined();
        expect(show).toContain(`FindWindow $${target} "" ""`);
        expect(show).toContain(`\${NSD_ClearImage} $${target}`);
        expect(show).toContain(
            'File /oname=$PLUGINSDIR\\bettershape-sidebar.gif "${BETTERSHAPE_SIDEBAR_GIF}"',
        );
        expect(leave).toContain("AnimGif::stop");
    });

    it("saves every register the show callback touches", () => {
        const show = hookFunction("BetterShapeSidebarShow");
        const pushed = [...show.matchAll(/^\s*Push (\$\w+)\s*$/gm)].map((match) => match[1]);
        const popped = [...show.matchAll(/^\s*Pop (\$\w+)\s*$/gm)].map((match) => match[1]);

        expect(pushed.length).toBeGreaterThan(0);
        expect(popped).toEqual([...pushed].reverse());
        for (const register of new Set(show.match(/\$R\d/g) ?? [])) {
            expect(pushed).toContain(register);
        }
    });

    it("anchors both asset paths to the hook directory", () => {
        // makensis resolves a relative !addplugindir against the working
        // directory at call time and silently skips a directory it cannot find.
        expect(hooks).toMatch(
            /^!addplugindir \/x86-unicode "\$\{__FILEDIR__\}\\plugins\\x86-unicode"$/m,
        );
        expect(hooks).toMatch(
            /^!define BETTERSHAPE_SIDEBAR_GIF "\$\{__FILEDIR__\}\\sidebar\.gif"$/m,
        );
    });
});
