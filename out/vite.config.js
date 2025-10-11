import react from "@vitejs/plugin-react-swc";
import path from "node:path";
import { defineConfig } from "vite";
import Spritesmith from "vite-plugin-spritesmith";
// https://vitejs.dev/config/
export default defineConfig(function (_a) {
    var command = _a.command;
    return {
        base: "",
        plugins: [
            react(),
            buildAtlas("person1", command === "serve", "Person", "jpg"),
            buildAtlas("person2", command === "serve", "Person", "jpg"),
            buildAtlas("building", command === "serve"),
            buildAtlas("tile", command === "serve"),
            buildAtlas("flag", command === "serve"),
            buildAtlas("misc", command === "serve"),
        ],
        server: {
            port: 3000,
            host: true,
        },
        build: {
            sourcemap: true,
            target: "es2015",
        },
        test: {
            browser: {
                enabled: true,
                headless: true,
                name: "chrome",
            },
        },
    };
});
function buildAtlas(folder, watch, nameOverride, format) {
    if (format === void 0) { format = "png"; }
    return Spritesmith({
        watch: watch,
        src: {
            cwd: "./src/textures/".concat(folder),
            glob: "*.png",
        },
        apiOptions: {
            generateSpriteName: function (filePath) {
                var name = nameOverride !== null && nameOverride !== void 0 ? nameOverride : "".concat(folder.charAt(0).toUpperCase()).concat(folder.slice(1));
                return "".concat(name, "_").concat(path.basename(filePath, ".png"));
            },
        },
        target: {
            image: "./src/images/textures_".concat(folder, ".").concat(format),
            css: [["./src/images/textures_".concat(folder, ".json"), { format: "json_texture" }]],
        },
        spritesmithOptions: {
            padding: 2,
            exportOpts: {
                format: format,
            },
        },
    });
}
