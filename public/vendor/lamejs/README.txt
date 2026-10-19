Forma Studio uses the unmodified @breezystack/lamejs 1.2.7 encoder for local MP3
downloads. LAME project: https://lame.sourceforge.net/

The library is licensed under LGPL-3.0. COPYING.LESSER and COPYING contain the
license texts. UPSTREAM-NOTICE.txt retains the package's original notice.
package-1.2.7.tgz is the exact npm distribution, including its unminified module.
source-1.2.7.zip contains the corresponding preferred source, build configuration
and package metadata at npm gitHead 1fb0ef5fa177413107e2e107d054a9b994e3f79c.

The encoder is loaded at runtime through a separate Web Worker, without being
combined into Forma's application bundle. On Windows its replaceable file is:
resources/app.asar.unpacked/dist/vendor/lamejs/lamejs.iife.js
On macOS use the corresponding Contents/Resources/app.asar.unpacked directory.
With Forma closed, an interface-compatible build can replace that file. Keep the
global lamejs.Mp3Encoder(channels, sampleRate, kbps), encodeBuffer and flush API.
The matching source and the original package are included beside the encoder.
You may modify/relink this library and reverse engineer the combined work for
debugging those modifications under the LGPL. Forma's archive integrity check
does not cover or prevent replacing this unpacked library. Updates may restore
the distributed version. No changes were made to the encoder itself.
