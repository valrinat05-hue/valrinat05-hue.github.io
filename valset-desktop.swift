import Cocoa
import WebKit

let PROJECT_DIR = NSHomeDirectory() + "/Desktop/\u{05D5}\u{05DC}\u{05DF}/cinematic-script-suite-main"
// Set VITE_ANTHROPIC_API_KEY in the project .env file — the web app reads it at runtime
let ANTHROPIC_KEY = ProcessInfo.processInfo.environment["VITE_ANTHROPIC_API_KEY"] ?? ""
let APP_URL = "http://localhost:5173"

// Polyfill: bridge showOpenFilePicker / showDirectoryPicker → Swift NSOpenPanel
let FSA_POLYFILL = """
(function() {
  if (typeof window.showOpenFilePicker === 'function') return; // native support exists

  function fileToObject(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({ name: file.name, type: file.type, dataURL: reader.result });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  let resolveFileCallback = null;
  let rejectFileCallback = null;

  window.__valsetFileResult__ = function(dataURL, name, type) {
    if (!resolveFileCallback) return;
    try {
      const base64 = dataURL.split(',')[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type });
      const file = new File([blob], name, { type });
      const handle = {
        kind: 'file',
        name: name,
        getFile: async () => file,
        queryPermission: async () => 'granted',
        requestPermission: async () => 'granted',
        isSameEntry: async () => false,
      };
      resolveFileCallback([handle]);
    } catch(e) { rejectFileCallback(e); }
    resolveFileCallback = null;
    rejectFileCallback = null;
  };

  window.__valsetFileError__ = function() {
    if (rejectFileCallback) {
      rejectFileCallback(Object.assign(new Error('AbortError'), {name:'AbortError'}));
    }
    resolveFileCallback = null;
    rejectFileCallback = null;
  };

  window.showOpenFilePicker = function(options) {
    return new Promise((resolve, reject) => {
      resolveFileCallback = resolve;
      rejectFileCallback = reject;
      window.webkit.messageHandlers.openFilePicker.postMessage({
        multiple: options && options.multiple ? true : false
      });
    });
  };

  window.showDirectoryPicker = function() {
    return new Promise((resolve, reject) => {
      resolveFileCallback = reject; // directory not supported, fall back
      rejectFileCallback = reject;
      window.webkit.messageHandlers.openFilePicker.postMessage({ multiple: true });
    });
  };

  console.log('[Valset] FSA polyfill installed');
})();
"""

class FilePicker: NSObject, WKScriptMessageHandler {
    weak var webView: WKWebView?

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == "openFilePicker" else { return }
        let body = message.body as? [String: Any]
        let multiple = body?["multiple"] as? Bool ?? false

        DispatchQueue.main.async {
            let panel = NSOpenPanel()
            panel.allowsMultipleSelection = multiple
            panel.canChooseFiles = true
            panel.canChooseDirectories = false
            panel.canCreateDirectories = false
            panel.title = "בחר סרטונים"
            panel.message = "בחר קבצי וידאו (.mp4, .mov, .avi, .mkv, .mts, .m2ts)"

            let response = panel.runModal()
            if response == .OK {
                // Process first file (for simplicity; send one at a time)
                for url in panel.urls {
                    if let data = try? Data(contentsOf: url) {
                        let base64 = data.base64EncodedString()
                        let ext = url.pathExtension.lowercased()
                        let mime: String
                        switch ext {
                        case "mp4": mime = "video/mp4"
                        case "mov": mime = "video/quicktime"
                        case "avi": mime = "video/avi"
                        case "mkv": mime = "video/x-matroska"
                        case "mts", "m2ts": mime = "video/mp2t"
                        case "webm": mime = "video/webm"
                        default: mime = "video/mp4"
                        }
                        let dataURL = "data:\(mime);base64,\(base64)"
                        let name = url.lastPathComponent
                        let js = "window.__valsetFileResult__(\(self.jsStr(dataURL)), \(self.jsStr(name)), \(self.jsStr(mime)))"
                        self.webView?.evaluateJavaScript(js, completionHandler: nil)
                        return  // only first file for now
                    }
                }
            }
            self.webView?.evaluateJavaScript("window.__valsetFileError__()", completionHandler: nil)
        }
    }

    func jsStr(_ s: String) -> String {
        let escaped = s
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
            .replacingOccurrences(of: "\n", with: "\\n")
        return "\"\(escaped)\""
    }
}

class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var filePicker = FilePicker()

    func applicationDidFinishLaunching(_ notification: Notification) {
        startDevServerIfNeeded()

        let config = WKWebViewConfiguration()

        // Add FSA polyfill as early user script
        let script = WKUserScript(source: FSA_POLYFILL,
                                  injectionTime: .atDocumentStart,
                                  forMainFrameOnly: false)
        config.userContentController.addUserScript(script)
        config.userContentController.add(filePicker, name: "openFilePicker")

        let prefs = WKWebpagePreferences()
        prefs.allowsContentJavaScript = true
        config.defaultWebpagePreferences = prefs

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        filePicker.webView = webView

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Valset AI"
        window.titlebarAppearsTransparent = true
        window.backgroundColor = NSColor(red: 0.039, green: 0.039, blue: 0.039, alpha: 1)
        window.contentView = webView
        window.setContentSize(NSSize(width: 1440, height: 900))
        window.minSize = NSSize(width: 1024, height: 700)
        window.center()
        window.makeKeyAndOrderFront(nil)

        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            if let url = URL(string: APP_URL) {
                self.webView.load(URLRequest(url: url))
            }
        }
    }

    // Native file open panel for <input type="file">
    func webView(_ webView: WKWebView,
                 runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.title = "בחר סרטונים"
        panel.runModal() == .OK ? completionHandler(panel.urls) : completionHandler(nil)
    }

    func startDevServerIfNeeded() {
        let check = Process()
        check.launchPath = "/bin/sh"
        check.arguments = ["-c", "lsof -i :5173 | grep -c LISTEN"]
        let pipe = Pipe()
        check.standardOutput = pipe
        check.standardError = Pipe()
        try? check.run()
        check.waitUntilExit()
        let out = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? "0"

        if out.trimmingCharacters(in: .whitespacesAndNewlines) == "0" {
            let server = Process()
            server.launchPath = "/bin/sh"
            server.arguments = ["-c",
                "cd \(PROJECT_DIR) && VITE_ANTHROPIC_API_KEY=\(ANTHROPIC_KEY) /usr/local/bin/npm run dev >> /tmp/valset-dev.log 2>&1 &"
            ]
            server.standardOutput = FileHandle.nullDevice
            server.standardError = FileHandle.nullDevice
            try? server.run()
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url,
           url.host != "localhost",
           navigationAction.navigationType == .linkActivated {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
        } else {
            decisionHandler(.allow)
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        webView.load(navigationAction.request)
        return nil
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let delegate = AppDelegate()
app.delegate = delegate
app.activate(ignoringOtherApps: true)
app.run()
