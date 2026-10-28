# Elastic plugin for Copilot Cowork

The Microsoft 365 Copilot Cowork counterpart of
[`elastic/claude-plugin`](https://github.com/elastic/claude-plugin): Elastic agent skills plus the
Elastic Docs MCP server, packaged as a Microsoft 365 app (Unified App Manifest v1.29).

See [Build plugins for Copilot Cowork](https://learn.microsoft.com/en-us/copilot/cowork/cowork-plugin-development).

## Structure

```
m365agents.yml                    # Agents Toolkit (atk) provision/publish pipeline
env/.env.dev                      # atk environment
appPackage/                       # Everything here ships in the zip, at the zip root
  manifest.json                   # M365 manifest: agentSkills[] + agentConnectors[]
  color.png                       # 192x192 full-colour icon
  outline.png                     # 32x32 white-on-transparent icon
  skills/<skill-name>/SKILL.md    # Flat: folder name MUST equal the SKILL.md `name`
```

## Scope: platform skills only

Cowork caps `agentSkills` at **20 per plugin** (`maxItems: 20` in the v1.28, v1.29 and devPreview
schemas). `elastic/agent-skills` has more than that, so this plugin carries only the platform
skills — `skills/cloud/*`, `skills/elasticsearch/*` and `skills/kibana/*` (17). Security and
Observability skills are expected to ship as separate per-solution plugins.

## Skills

Copied from [`elastic/agent-skills`](https://github.com/elastic/agent-skills) `main`. Upstream
nests skills as `skills/<category>/<skill>/`; Cowork requires a flat `skills/<name>/` where the
folder matches the frontmatter `name`, so they are flattened on copy:

```sh
AS=../agent-skills
rm -rf appPackage/skills && mkdir appPackage/skills
for d in $AS/skills/{cloud,elasticsearch,kibana}/*/; do
  n=$(awk '/^---/{c++;next} c==1 && /^name:/{sub(/^name:[ ]*/,"");print;exit}' "$d/SKILL.md")
  cp -R "$d" "appPackage/skills/$n"
done
```

Then make sure `agentSkills[]` in `appPackage/manifest.json` lists every folder. Don't edit files
under `appPackage/skills/` by hand; fix them upstream.

Per-skill limits: ≤ 20 companion files, ≤ 5 MB per file, ≤ 10 MB total, no hidden files.

## MCP server

`agentConnectors[0]` registers the public Elastic Docs MCP server
(`https://www.elastic.co/docs/_mcp/`, no auth). Cowork discovers its tools live from the server,
so no `mcpToolDescription` file is shipped (optional at manifest v1.29; only v1.28 requires it).

## Validate and package

Requires `@microsoft/m365agentstoolkit-cli` (`atk`) ≥ 1.1.12.

```sh
atk validate --manifest-file ./appPackage/manifest.json --env dev        # local schema check
atk package --env dev                                                    # -> appPackage/build/appPackage.dev.zip
atk validate --package-file ./appPackage/build/appPackage.dev.zip --env dev  # server-side rules (M365 sign-in)
```

## Trying it out

You need a Microsoft 365 Copilot license with Cowork enabled; open
[copilot.cloud.microsoft](https://copilot.cloud.microsoft) and pick **Cowork** next to **Chat**
([get started](https://learn.microsoft.com/en-us/copilot/cowork/get-started)).

Simplest path, no CLI ([Customize Cowork](https://learn.microsoft.com/en-us/copilot/cowork/cowork-customize)):
**Customize → Plugins → Upload plugin**, pick `appPackage/build/appPackage.dev.zip`, share with
**Only you**. Verify under **Customize → Plugins → Installed**, then start a new conversation;
active plugin skills appear as chips in the side panel. Remove via the plugin's
**Remove from Cowork**.

CLI alternative (sideloads into your account only):

```sh
atk auth login m365
atk install --file-path ./appPackage/build/appPackage.dev.zip --scope Personal
```
