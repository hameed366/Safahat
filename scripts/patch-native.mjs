// Adds what صفحات needs to the generated native projects (run after `npx cap add <platform>`):
//  iOS:     Apple Pencil double-tap/squeeze, camera/photos permissions, "Open in صفحات" for PDFs and images, Files-app folder, Arabic, iPad orientations, build number
//  Android: camera permission, "Open with صفحات" for PDFs, version code
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const platform = process.argv[2];
const build = process.env.BUILD_NUMBER || process.env.GITHUB_RUN_NUMBER || '1';
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

function must(cond, msg) { if (!cond) { console.error('patch-native: ' + msg); process.exit(1); } }

if (platform === 'ios') {
  const plistPath = path.join(root, 'ios/App/App/Info.plist');
  must(fs.existsSync(plistPath), 'Info.plist not found — run `npx cap add ios` first');
  let p = fs.readFileSync(plistPath, 'utf8');
  const setKey = (key, xml) => {
    const re = new RegExp(`\\s*<key>${key}</key>\\s*(<string>[^<]*</string>|<true/>|<false/>|<array>[\\s\\S]*?</array>|<dict>[\\s\\S]*?</dict>)`);
    p = p.replace(re, '');
    p = p.replace(/<\/dict>\s*<\/plist>\s*$/, `\t<key>${key}</key>\n\t${xml}\n</dict>\n</plist>\n`);
  };
  setKey('CFBundleDisplayName', '<string>صفحات</string>');
  setKey('CFBundleDevelopmentRegion', '<string>ar</string>');
  setKey('CFBundleLocalizations', '<array><string>ar</string><string>en</string></array>');
  setKey('CFBundleShortVersionString', `<string>${version}</string>`);
  setKey('CFBundleVersion', `<string>${build}</string>`);
  setKey('NSCameraUsageDescription', '<string>لتصوير المستندات والبطاقة المدنية وتحويلها إلى ملفات PDF.</string>');
  setKey('NSMicrophoneUsageDescription', '<string>لتسجيل الملاحظات الصوتية وإرفاقها بالملف.</string>');
  setKey('NSPhotoLibraryUsageDescription', '<string>لاختيار صور من مكتبتك وتحويلها إلى ملفات PDF.</string>');
  setKey('NSPhotoLibraryAddUsageDescription', '<string>لحفظ الصفحات المصدَّرة كصور في مكتبة الصور.</string>');
  setKey('UIFileSharingEnabled', '<true/>');
  setKey('LSSupportsOpeningDocumentsInPlace', '<false/>');
  setKey('UISupportsDocumentBrowser', '<false/>');
  setKey('CFBundleDocumentTypes', `<array>
\t\t<dict><key>CFBundleTypeName</key><string>PDF</string><key>CFBundleTypeRole</key><string>Editor</string><key>LSHandlerRank</key><string>Alternate</string><key>LSItemContentTypes</key><array><string>com.adobe.pdf</string></array></dict>
\t\t<dict><key>CFBundleTypeName</key><string>Image</string><key>CFBundleTypeRole</key><string>Viewer</string><key>LSHandlerRank</key><string>Alternate</string><key>LSItemContentTypes</key><array><string>public.jpeg</string><string>public.png</string><string>public.heic</string></array></dict>
\t</array>`);
  setKey('UISupportedInterfaceOrientations~ipad', `<array><string>UIInterfaceOrientationPortrait</string><string>UIInterfaceOrientationPortraitUpsideDown</string><string>UIInterfaceOrientationLandscapeLeft</string><string>UIInterfaceOrientationLandscapeRight</string></array>`);
  setKey('UIRequiresFullScreen', '<false/>');
  fs.writeFileSync(plistPath, p);
  // build number in the Xcode project as well
  const pbx = path.join(root, 'ios/App/App.xcodeproj/project.pbxproj');
  if (fs.existsSync(pbx)) {
    let x = fs.readFileSync(pbx, 'utf8');
    x = x.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`).replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);
    fs.writeFileSync(pbx, x);
  }
  // Apple Pencil double-tap and squeeze (Pencil Pro) are only delivered to native code:
  // forward them to the page, which opens its tool circle at the pencil tip or switches to the eraser.
  const appDelegate = path.join(root, 'ios/App/App/AppDelegate.swift');
  if (fs.existsSync(appDelegate)) {
    let sw = fs.readFileSync(appDelegate, 'utf8');
    if (!sw.includes('SafahatPencil')) {
      if (!/import WebKit/.test(sw)) sw = sw.replace(/import UIKit\n/, 'import UIKit\nimport WebKit\n');
      sw = sw.replace(/(didFinishLaunchingWithOptions[^{]*\{)/, '$1\n        SafahatPencil.shared.hook()');
      must(sw.includes('SafahatPencil.shared.hook()'), 'could not hook AppDelegate');
      sw += `
// MARK: - Apple Pencil double-tap / squeeze -> صفحات (added by scripts/patch-native.mjs)
final class SafahatPencil: NSObject, UIPencilInteractionDelegate {
    static let shared = SafahatPencil()
    private weak var web: WKWebView?

    func hook(_ tries: Int = 0) {
        if web != nil { return }
        let root = (UIApplication.shared.delegate as? AppDelegate)?.window?.rootViewController
        if let v = root?.view, let w = SafahatPencil.find(v) {
            web = w
            let interaction = UIPencilInteraction()
            interaction.delegate = self
            w.addInteraction(interaction)
            return
        }
        if tries < 60 {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self.hook(tries + 1) }
        }
    }

    private static func find(_ v: UIView) -> WKWebView? {
        if let w = v as? WKWebView { return w }
        for s in v.subviews { if let w = find(s) { return w } }
        return nil
    }

    private func name(_ a: UIPencilPreferredAction) -> String {
        switch a {
        case .ignore: return "ignore"
        case .switchEraser: return "eraser"
        case .switchPrevious: return "previous"
        default: return "menu"
        }
    }

    private func send(_ kind: String, _ p: CGPoint?, _ action: String) {
        guard let w = web else { return }
        let x = p.map { String(format: "%.1f", Double($0.x)) } ?? "null"
        let y = p.map { String(format: "%.1f", Double($0.y)) } ?? "null"
        w.evaluateJavaScript("window.safahatPencilEvent&&window.safahatPencilEvent('\\(kind)',\\(x),\\(y),'\\(action)')", completionHandler: nil)
    }

    // iPadOS 12.1 to 17.4
    func pencilInteractionDidTap(_ interaction: UIPencilInteraction) {
        send("tap", nil, name(UIPencilInteraction.preferredTapAction))
    }

    @available(iOS 17.5, *)
    func pencilInteraction(_ interaction: UIPencilInteraction, didReceiveTap tap: UIPencilInteraction.Tap) {
        send("tap", tap.hoverPose?.location, name(UIPencilInteraction.preferredTapAction))
    }

    @available(iOS 17.5, *)
    func pencilInteraction(_ interaction: UIPencilInteraction, didReceiveSqueeze squeeze: UIPencilInteraction.Squeeze) {
        if squeeze.phase == .ended {
            send("squeeze", squeeze.hoverPose?.location, name(UIPencilInteraction.preferredSqueezeAction))
        }
    }
}
`;
      fs.writeFileSync(appDelegate, sw);
    }
  }
  // Handwriting to text on the device: ML Kit digital ink recognition as a small Capacitor plugin.
  {
    const podfile = path.join(root, 'ios/App/Podfile');
    must(fs.existsSync(podfile), 'Podfile not found');
    let pf = fs.readFileSync(podfile, 'utf8');
    pf = pf.replace(/platform :ios, '[^']+'/, "platform :ios, '15.5'");
    if (!pf.includes('GoogleMLKit/DigitalInkRecognition')) pf = pf.replace(/(target 'App' do\n)/, "$1  pod 'GoogleMLKit/DigitalInkRecognition'\n");
    must(pf.includes('GoogleMLKit/DigitalInkRecognition'), 'could not add the ML Kit pod');
    fs.writeFileSync(podfile, pf);
    if (fs.existsSync(pbx)) fs.writeFileSync(pbx, fs.readFileSync(pbx, 'utf8').replace(/IPHONEOS_DEPLOYMENT_TARGET = [^;]+;/g, 'IPHONEOS_DEPLOYMENT_TARGET = 15.5;'));
    const sb = path.join(root, 'ios/App/App/Base.lproj/Main.storyboard');
    must(fs.existsSync(sb), 'Main.storyboard not found');
    let st = fs.readFileSync(sb, 'utf8');
    st = st.replace(/customClass="CAPBridgeViewController" customModule="Capacitor"/, 'customClass="SafahatVC" customModule="App" customModuleProvider="target"');
    must(st.includes('customClass="SafahatVC"'), 'could not point the storyboard at SafahatVC');
    fs.writeFileSync(sb, st);
    let sw = fs.readFileSync(appDelegate, 'utf8');
    if (!sw.includes('SafahatInkPlugin')) {
      sw = sw.replace(/import UIKit\n/, 'import UIKit\nimport MLKit\n');
      sw += `
// The app's web view controller: registers the handwriting plugin before the page loads.
class SafahatVC: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SafahatInkPlugin())
    }
}

@objc(SafahatInkPlugin)
public class SafahatInkPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SafahatInkPlugin"
    public let jsName = "SafahatInk"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "recognize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prepare", returnType: CAPPluginReturnPromise)
    ]
    private var recognizers: [String: DigitalInkRecognizer] = [:]

    private func model(_ lang: String) -> DigitalInkRecognitionModel? {
        guard let id = DigitalInkRecognitionModelIdentifier(forLanguageTag: lang) else { return nil }
        return DigitalInkRecognitionModel(modelIdentifier: id)
    }
    private func fetch(_ m: DigitalInkRecognitionModel) {
        _ = ModelManager.modelManager().download(m, conditions: ModelDownloadConditions(allowsCellularAccess: true, allowsBackgroundDownloading: true))
    }

    @objc func prepare(_ call: CAPPluginCall) {
        let lang = call.getString("lang") ?? "ar"
        guard let m = model(lang) else { call.reject("unsupported", "unsupported"); return }
        let ready = ModelManager.modelManager().isModelDownloaded(m)
        if !ready { fetch(m) }
        call.resolve(["ready": ready])
    }

    @objc func recognize(_ call: CAPPluginCall) {
        let lang = call.getString("lang") ?? "ar"
        guard let m = model(lang) else { call.reject("unsupported", "unsupported"); return }
        if !ModelManager.modelManager().isModelDownloaded(m) { fetch(m); call.reject("no_model", "no_model"); return }
        guard let json = call.getString("strokes"), let data = json.data(using: .utf8),
              let raw = (try? JSONSerialization.jsonObject(with: data)) as? [[[NSNumber]]] else { call.reject("bad_input", "failed"); return }
        var strokes: [Stroke] = []
        for s in raw {
            var pts: [StrokePoint] = []
            for p in s where p.count >= 2 {
                pts.append(StrokePoint(x: p[0].floatValue, y: p[1].floatValue, t: p.count > 2 ? p[2].intValue : 0))
            }
            if !pts.isEmpty { strokes.append(Stroke(points: pts)) }
        }
        if strokes.isEmpty { call.reject("empty", "failed"); return }
        let rec: DigitalInkRecognizer
        if let r = recognizers[lang] { rec = r } else {
            rec = DigitalInkRecognizer.digitalInkRecognizer(options: DigitalInkRecognizerOptions(model: m))
            recognizers[lang] = rec
        }
        rec.recognize(ink: Ink(strokes: strokes)) { result, error in
            guard let result = result, let first = result.candidates.first else { call.reject(error?.localizedDescription ?? "failed", "failed"); return }
            call.resolve(["text": first.text, "cands": result.candidates.prefix(5).map { $0.text }])
        }
    }
}
`;
      fs.writeFileSync(appDelegate, sw);
    }
  }
  console.log('iOS patched (build ' + build + ')');
}
else if (platform === 'android') {
  const mPath = path.join(root, 'android/app/src/main/AndroidManifest.xml');
  must(fs.existsSync(mPath), 'AndroidManifest.xml not found — run `npx cap add android` first');
  let m = fs.readFileSync(mPath, 'utf8');
  const perm = n => { if (!m.includes(`android.permission.${n}"`)) m = m.replace(/(<manifest[^>]*>)/, `$1\n    <uses-permission android:name="android.permission.${n}" />`); };
  perm('CAMERA');
  perm('RECORD_AUDIO');
  perm('MODIFY_AUDIO_SETTINGS');
  if (!m.includes('android.hardware.camera')) m = m.replace(/(<manifest[^>]*>)/, `$1\n    <uses-feature android:name="android.hardware.camera" android:required="false" />`);
  const filters = `
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="content" android:mimeType="application/pdf" />
                <data android:scheme="file" android:mimeType="application/pdf" />
            </intent-filter>`;
  if (!m.includes('application/pdf')) {
    // insert into the MainActivity, right after its first intent-filter
    m = m.replace(/(<activity[\s\S]*?MainActivity[\s\S]*?<\/intent-filter>)/, `$1${filters}`);
    must(m.includes('application/pdf'), 'could not find MainActivity intent-filter');
  }
  fs.writeFileSync(mPath, m);
  const g = path.join(root, 'android/app/build.gradle');
  if (fs.existsSync(g)) {
    let s = fs.readFileSync(g, 'utf8');
    s = s.replace(/versionCode\s+\d+/, `versionCode ${build}`).replace(/versionName\s+"[^"]*"/, `versionName "${version}"`);
    fs.writeFileSync(g, s);
  }
  // Handwriting to text on the device: ML Kit digital ink recognition as a small Capacitor plugin.
  {
    must(fs.existsSync(g), 'app/build.gradle not found');
    let gr = fs.readFileSync(g, 'utf8');
    if (!gr.includes('digital-ink-recognition')) gr = gr.replace(/\ndependencies\s*\{/, "\ndependencies {\n    implementation 'com.google.mlkit:digital-ink-recognition:18.1.0'");
    must(gr.includes('digital-ink-recognition'), 'could not add the ML Kit dependency');
    fs.writeFileSync(g, gr);
    const find = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { const r = find(f); if (r) return r; } else if (e.name === 'MainActivity.java') return f; } return null; };
    const main = find(path.join(root, 'android/app/src/main/java'));
    must(main, 'MainActivity.java not found');
    let mj = fs.readFileSync(main, 'utf8');
    const pkg = (mj.match(/package\s+([\w.]+);/) || [])[1];
    must(pkg, 'could not read the Android package name');
    if (!mj.includes('SafahatInkPlugin')) {
      mj = `package ${pkg};

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SafahatInkPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`;
      fs.writeFileSync(main, mj);
    }
    fs.writeFileSync(path.join(path.dirname(main), 'SafahatInkPlugin.java'), `package ${pkg};

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.common.model.DownloadConditions;
import com.google.mlkit.common.model.RemoteModelManager;
import com.google.mlkit.vision.digitalink.DigitalInkRecognition;
import com.google.mlkit.vision.digitalink.DigitalInkRecognitionModel;
import com.google.mlkit.vision.digitalink.DigitalInkRecognitionModelIdentifier;
import com.google.mlkit.vision.digitalink.DigitalInkRecognizer;
import com.google.mlkit.vision.digitalink.DigitalInkRecognizerOptions;
import com.google.mlkit.vision.digitalink.Ink;
import com.google.mlkit.vision.digitalink.RecognitionCandidate;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONArray;

/** Handwriting to text on the device: strokes in, text out. Works offline once the language model is downloaded. */
@CapacitorPlugin(name = "SafahatInk")
public class SafahatInkPlugin extends Plugin {
    private final Map<String, DigitalInkRecognizer> recognizers = new HashMap<>();

    private DigitalInkRecognitionModel model(String lang) {
        try {
            DigitalInkRecognitionModelIdentifier id = DigitalInkRecognitionModelIdentifier.fromLanguageTag(lang);
            return id == null ? null : DigitalInkRecognitionModel.builder(id).build();
        } catch (Exception e) {
            return null;
        }
    }

    private void fetch(DigitalInkRecognitionModel m) {
        RemoteModelManager.getInstance().download(m, new DownloadConditions.Builder().build());
    }

    @PluginMethod
    public void prepare(PluginCall call) {
        final DigitalInkRecognitionModel m = model(call.getString("lang", "ar"));
        if (m == null) { call.reject("unsupported", "unsupported"); return; }
        RemoteModelManager.getInstance().isModelDownloaded(m)
            .addOnSuccessListener(ready -> {
                if (!ready) fetch(m);
                JSObject r = new JSObject();
                r.put("ready", ready);
                call.resolve(r);
            })
            .addOnFailureListener(e -> call.reject("failed", "failed"));
    }

    @PluginMethod
    public void recognize(PluginCall call) {
        final String lang = call.getString("lang", "ar");
        final DigitalInkRecognitionModel m = model(lang);
        if (m == null) { call.reject("unsupported", "unsupported"); return; }
        final Ink ink;
        try {
            JSONArray strokes = new JSONArray(call.getString("strokes", "[]"));
            Ink.Builder ib = Ink.builder();
            for (int i = 0; i < strokes.length(); i++) {
                JSONArray s = strokes.getJSONArray(i);
                Ink.Stroke.Builder sb = Ink.Stroke.builder();
                int n = 0;
                for (int j = 0; j < s.length(); j++) {
                    JSONArray p = s.getJSONArray(j);
                    if (p.length() < 2) continue;
                    sb.addPoint(Ink.Point.create((float) p.getDouble(0), (float) p.getDouble(1), p.length() > 2 ? p.getLong(2) : 0L));
                    n++;
                }
                if (n > 0) ib.addStroke(sb.build());
            }
            ink = ib.build();
        } catch (Exception e) {
            call.reject("bad_input", "failed");
            return;
        }
        if (ink.getStrokes().isEmpty()) { call.reject("empty", "failed"); return; }
        RemoteModelManager.getInstance().isModelDownloaded(m)
            .addOnSuccessListener(ready -> {
                if (!ready) { fetch(m); call.reject("no_model", "no_model"); return; }
                DigitalInkRecognizer rec = recognizers.get(lang);
                if (rec == null) {
                    rec = DigitalInkRecognition.getClient(DigitalInkRecognizerOptions.builder(m).build());
                    recognizers.put(lang, rec);
                }
                rec.recognize(ink)
                    .addOnSuccessListener(res -> {
                        if (res.getCandidates().isEmpty()) { call.reject("failed", "failed"); return; }
                        JSObject r = new JSObject();
                        r.put("text", res.getCandidates().get(0).getText());
                        JSArray cands = new JSArray();
                        int k = 0;
                        for (RecognitionCandidate c : res.getCandidates()) { if (k++ >= 5) break; cands.put(c.getText()); }
                        r.put("cands", cands);
                        call.resolve(r);
                    })
                    .addOnFailureListener(e -> call.reject("failed", "failed"));
            })
            .addOnFailureListener(e -> call.reject("failed", "failed"));
    }
}
`);
  }
  // Arabic app name
  const strings = path.join(root, 'android/app/src/main/res/values/strings.xml');
  if (fs.existsSync(strings)) {
    let s = fs.readFileSync(strings, 'utf8');
    s = s.replace(/(<string name="app_name">)[^<]*(<\/string>)/, '$1صفحات$2').replace(/(<string name="title_activity_main">)[^<]*(<\/string>)/, '$1صفحات$2');
    fs.writeFileSync(strings, s);
  }
  console.log('Android patched (versionCode ' + build + ')');
}
else { console.error('usage: node scripts/patch-native.mjs ios|android'); process.exit(1); }
