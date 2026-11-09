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
  console.log('iOS patched (build ' + build + ')');
}
else if (platform === 'android') {
  const mPath = path.join(root, 'android/app/src/main/AndroidManifest.xml');
  must(fs.existsSync(mPath), 'AndroidManifest.xml not found — run `npx cap add android` first');
  let m = fs.readFileSync(mPath, 'utf8');
  const perm = n => { if (!m.includes(`android.permission.${n}"`)) m = m.replace(/(<manifest[^>]*>)/, `$1\n    <uses-permission android:name="android.permission.${n}" />`); };
  perm('CAMERA');
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
