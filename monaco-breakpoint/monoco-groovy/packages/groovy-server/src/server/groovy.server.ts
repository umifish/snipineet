import { runLanguageServer } from "../runner/language-server-runner.ts";
import { LanguageName } from "../runner/server-common.ts";
import { groovyConfig } from "../config.ts";

export const runGroovyLanguageServer = () => {
  runLanguageServer({
    serverName: "GROOVY",
    pathName: groovyConfig.path,
    serverPort: groovyConfig.port,
    runCommand: LanguageName.java,
    runCommandArgs: [
      "-jar",
      `${groovyConfig.basePath}/lib/groovy-language-server-all.jar`,
    ],
    wsServerOptions: {
      noServer: true,
      perMessageDeflate: false,
    },
  });
};
