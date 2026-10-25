OutputTracer browser DOSBox runtime — pinned third-party assets

Runtime: emulators 8.5.2, published by the js-dos project (GPL-2.0).
Official npm archive: https://registry.npmjs.org/emulators/-/emulators-8.5.2.tgz
npm integrity: sha512-XW+1SsuYd/egY1EmuOpq6k9kUqrGyoaN8o1sqkVvDJRFWy4lrCqst3of6TBZj1m//4aU/ZSt5VbqQBcRl+Uk1Q==
Upstream source commit: 6bbf0925d221a7304ea8e0dda1e89b8dc01569b2
DOSBox submodule commit: 528578d5a6f76afd4d5ef4e722b5670826f1183a
The unmodified runtime and wasm are served from emulators-8.5.2/.
The complete corresponding upstream wrapper/build and DOSBox source archives
are provided in source/ alongside this binary distribution:
  source/emulators-8.5.2-source.tar.gz
  source/dosbox-source.tar.gz
Build instructions and scripts are included in the emulators source archive.
Additional upstream source: https://github.com/js-dos/emulators
License: emulators-8.5.2/LICENSE
Only the classic DOSBox backend is included; DOSBox-X assets are not shipped.

Assembler: NASM 2.16.03 official DOS release (2-clause BSD).
Official archive: https://www.nasm.us/pub/nasm/releasebuilds/2.16.03/dos/nasm-2.16.03-dos.zip
NASM.EXE and CWSDPMI.EXE are unmodified files extracted from that archive.
License: nasm-2.16.03/LICENSE
NASM source: https://www.nasm.us/pub/nasm/releasebuilds/2.16.03/

DPMI host: CWSDPMI release 7, Copyright (C) 1995-2010 Charles W Sandmann.
Unmodified redistribution permission and source/update rights are documented
in nasm-2.16.03/CWSDPMI.TXT.
CWSDPMI source and binary updates: https://sandmann.dotster.com/cwsdpmi/
Users have the right to receive CWSDPMI source code and/or binary updates.

SHA256SUMS records the included runtime/toolchain file hashes.
The browser runtime does not use a CDN, remote compilation, or an API token.
Runtime sources and input files are copied into a new private virtual drive
for each Run; generated OUTPUT files are not automatically shared or graded.
