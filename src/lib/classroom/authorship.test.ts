import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { seedDoc } from "@/lib/cloud/collabDoc";
import { authorshipOfDoc, authorshipOfText, watchLocalAuthorship } from "./authorship";

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("authorship", () => {
  it("keeps starter text out of the percentage and colors only typed characters", async () => {
    const server = new Y.Doc();
    seedDoc(server, { "main.cpp": "int main(){}\n" });

    const ali = new Y.Doc();
    const stopAli = watchLocalAuthorship(ali, () => "ali");
    Y.applyUpdate(ali, Y.encodeStateAsUpdate(server), "remote");
    const aliText = ali.getMap("files").get("main.cpp") as Y.Text;
    aliText.insert(aliText.length, "int x;\n");
    await flush();

    const sara = new Y.Doc();
    const stopSara = watchLocalAuthorship(sara, () => "sara");
    Y.applyUpdate(sara, Y.encodeStateAsUpdate(ali), "remote");
    const saraText = sara.getMap("files").get("main.cpp") as Y.Text;
    saraText.insert(saraText.length, "int y;");
    await flush();

    Y.applyUpdate(ali, Y.encodeStateAsUpdate(sara), "remote");
    const report = authorshipOfText(ali.getMap("files").get("main.cpp") as Y.Text);
    const byId = Object.fromEntries(report.shares.map((share) => [share.authorId, share]));

    expect(report.starter).toBe("int main(){}\n".length);
    expect(byId.ali.characters).toBe("int x;\n".length);
    expect(byId.sara.characters).toBe("int y;".length);
    expect(byId.ali.percent + byId.sara.percent).toBe(100);
    expect(report.spans.map((span) => span.authorId)).toEqual(["ali", "sara"]);

    const teacher = new Y.Doc();
    Y.applyUpdate(teacher, Y.encodeStateAsUpdate(ali), "remote");
    expect(authorshipOfDoc(teacher).shares.map((share) => share.authorId).sort()).toEqual(["ali", "sara"]);

    stopAli();
    stopSara();
  });

  it("does not claim starter text that this client inserted before joining", async () => {
    const doc = new Y.Doc();
    seedDoc(doc, { "main.cpp": "starter" });
    const stop = watchLocalAuthorship(doc, () => "ali");
    const text = doc.getMap("files").get("main.cpp") as Y.Text;
    text.insert(text.length, " added");
    await flush();
    const report = authorshipOfText(text);
    expect(report.starter).toBe("starter".length);
    expect(report.shares).toEqual([{ authorId: "ali", characters: " added".length, percent: 100 }]);
    stop();
  });

  it("gives a viewer no authorship when they are not the editor", async () => {
    const doc = new Y.Doc();
    seedDoc(doc, { "main.cpp": "" });
    const stop = watchLocalAuthorship(doc, () => null);
    const text = doc.getMap("files").get("main.cpp") as Y.Text;
    text.insert(0, "teacher");
    await flush();
    expect(authorshipOfText(text).shares).toEqual([]);
    expect(authorshipOfText(text).starter).toBe("teacher".length);
    stop();
  });
});
