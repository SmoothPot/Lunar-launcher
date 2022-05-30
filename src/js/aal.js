// AlphaAntiLeak NodeJS Runner Module

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const http = require("http");
const https = require("https");
const { execFile, spawn } = require("child_process");
const log = require('electron-log');
const aalcdn = "http://cdn.alphaantileak.net";


log.transports.file.level = "info";

/**
 * Hashes a file
 * @param path The path to the file
 * @returns {Buffer} The base64 encoded sha1
 */
function hashFile(path) {
	let data = fs.readFileSync(path);
	let hash = crypto.createHash("sha256");
	hash.update(data);
	return hash.digest();
}

/**
 * Gets the installation package
 * @returns {string} When OS is supported return identifier, otherwise null
 */
function getLauncherFile() {
	if (process.platform === "win32") {
		return "AAL_Windows_Launcher"
	}
	return null;
}

function ___validateInstall(resolve, reject, url, local_hash) {
    let lib = url.startsWith("https:") ? https : http;

    lib.get(url, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers["location"]) {
            url = res.headers["location"];
            res.resume();
            ___validateInstall(resolve, reject, url, local_hash);
            return;
        }

        if (res.statusCode !== 200) {
            res.resume(); // free memory
            reject(`A server-side ${res.statusCode} error occurred`);
            return;
        }
        let rawData = Buffer.alloc(0);
        res.on("data", chunk => {
            let new_buf = Buffer.from(chunk);
            rawData = Buffer.concat([rawData, new_buf], rawData.length + new_buf.length);
        });
        res.on("end", () => {
            resolve(rawData.equals(local_hash));
        });
    }).on("error", e => {
        log.info("[Native] Error validating Installation", e);
        reject(e);
    });
}

function __validateInstall(resolve, reject) {
    // Get install package
	let launcher_file = getLauncherFile();
	if (!launcher_file) {
		reject("Unsupported OS");
		return;
	}

    let local_hash;
    try {
        local_hash = hashFile(launcher_file + getPlatformExecutableExt());
    } catch(e) {
        console.error("Failed hashing file ", e);
        resolve(false); // due to this most likely being invalid hash
        return;
    }

    ___validateInstall(resolve, reject, aalcdn + "/AAL/" + launcher_file + ".hash", local_hash);
}

/**
 * Validates the installation
 * @returns {Promise<boolean>} Is installation valid
 */
function validateInstall() {
    return new Promise(__validateInstall);
}

function __install_download(url, launcher_file, resolve, reject, status_callback) {
    let lib = url.startsWith("https:") ? https : http;

    lib.get(url, res => {
        log.info("[Native] Downloading...");
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers["location"]) {
            url = res.headers["location"];
            res.resume();
            __install_download(url, launcher_file, resolve, reject, status_callback);
            return;
        }
        if (res.statusCode !== 200) {
            res.resume(); // free memory
            reject("A server-side " + res.statusCode + " error occurred");
            return;
        }
        try {
            fs.chmodSync(launcher_file, 0o774); // make writable
        } catch (e) {}
        let out = fs.createWriteStream(launcher_file);
        let dataRead = 0;
        let finalLen = res.headers["content-length"];
        res.on("data", chunk => {
            dataRead += chunk.length;
            status_callback(dataRead / finalLen);
            out.write(chunk);
        });
        res.on("end", () => {
            status_callback(1.0);
            out.on("close", () => {
                fs.chmodSync(launcher_file, 0o774);
                resolve();
            });
            out.end();
        });
    }).on("error", e => {
        log.info("[Native] Error downloading", e);
        reject(e);
    });
}

/**
 * Installs the AAL Launcher Core
 * @param status_callback a callback which receives a percentage (0.0 - 1.0)
 * @returns {Promise<void>} a callback
 */
function install(status_callback) {
    if (typeof status_callback !== "function") {
        status_callback = function (percent) {};
    }
    return new Promise(function (resolve, reject) {
        status_callback(0.0);
        log.info("Installing...");
        let launcher_file = getLauncherFile() + getPlatformExecutableExt();
        if (!launcher_file)
        {
            reject("Unsupported OS");
            return;
        }
        let url = aalcdn + "/AAL/" + launcher_file;

        __install_download(url, launcher_file, resolve, reject, status_callback);
    });
}

function getPlatformExecutableExt() {
	if (process.platform === "win32") {
		return ".exe"
	} else if (process.platform === "linux") {
		return "";
    }
    return null;
}

function startAAL(appid, session, args, donecb, outputcb, processcb) {
	log.info("Starting native");
	let finalArgs = [appid, session];
	let exe = getLauncherFile() + getPlatformExecutableExt();
	args.forEach(arg => finalArgs.push(arg));
	if (process.platform !== "win32") { // unix system
		fs.chmodSync(exe, 0o774);
	}
	console.debug("Native Pre Launch");
	let AAL = spawn(exe, finalArgs, { windowsHide: true, detached: true });
    console.debug("AAL Post Launch");
	AAL.stdout.on("data", outputcb);
	AAL.stderr.on("data", outputcb);
	AAL.on("exit", code => {
		log.info("AAL-Core exited with code " + code);
		donecb(code);
	});
	processcb(AAL);
}

let install_lock = false;

function __ensureInstallation(status_callback, resolve, reject) {
    validateInstall().then(valid => {
        if (valid) resolve();
        else install(status_callback).then(resolve).catch(reject);
    }).catch(reject);
}

function _ensureInstallation(status_callback, resolve, reject) {
    if (install_lock) {
        setTimeout(_ensureInstallation, 1000, status_callback, resolve, reject);
    } else {
        install_lock = true;
        let resolveHook = function(ret) {
            install_lock = false;
            resolve(ret);
        };
        let rejectHook = function(err) {
            install_lock = false;
            reject(err);
        };
        __ensureInstallation(status_callback, resolveHook, rejectHook);
    }
}

function ensureInstallation(status_callback) {
    return new Promise(function (resolve, reject) {
        _ensureInstallation(status_callback, resolve, reject);
    });
}

function launchApp(appid, session, args, errorcb, donecb, outputcb, processcb) {
	ensureInstallation().then(() => {
        const output_handler = data => {
            // turn windows and mac os output into linux output
            data = data.toString().replace("\r\n", "\n").replace("\r", "\n");

            data.split("\n").forEach(line => {
                outputcb(line);
            });
        };

        startAAL(appid, session, args, donecb, output_handler, processcb);
    }).catch(errorcb);
}

module.exports = {
	"launchApp": launchApp,
  "ensureInstallation": ensureInstallation
};
