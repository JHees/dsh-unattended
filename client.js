window.__ModuleLoader__.load({
  id: "dsh-unattended",
  factory(require) {
    const React = require("react");

    const NS = "unattended";
    const STYLE_ID = "dsh-unattended/toggle.css";

    /** 简体中文字典（键集真源）。 */
    const zh = {
      "label.off": "无人值守",
      "label.on": "无人值守中",
      "title.off": "无人值守已关闭：自动审查拒绝后会等待你审批。点击开启无人值守。",
      "title.on": "无人值守已开启：自动审查仍逐次判断——同意则执行，拒绝则直接拒绝，不再弹出人工审批。点击关闭。",
    };
    /** English dictionary, checked against the Chinese key set. */
    const en = {
      "label.off": "Unattended",
      "label.on": "Unattended on",
      "title.off": "Unattended is off: auto review denials wait for your approval. Click to turn unattended on.",
      "title.on": "Unattended is on: the reviewer still decides every call — allowed calls run, denied calls are rejected directly, with no human approval prompt. Click to turn off.",
    };

    /** Composer chip; mirrors the permission control's look and hover behavior. */
    const css = [
      ".dsh-unattended{border-radius:var(--dsw-radius-sm);min-width:0;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;outline:none;align-items:center;gap:4px;padding:0 8px;font-size:13px;font-weight:500;line-height:20px;display:inline-flex}",
      ".dsh-unattended:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}",
      ".dsh-unattended:focus-visible{box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}",
      ".dsh-unattended:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}",
      ".dsh-unattended svg{width:14px;height:14px;flex:none}",
      ".dsh-unattended.is-on{color:var(--dsw-alias-state-warn-primary);background:var(--dsw-alias-state-warn-tertiary)}",
      ".dsh-unattended-label{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}",
      "@container (width<=460px){.dsh-unattended .dsh-unattended-label{display:none}}",
    ].join("");

    function UnattendedToggle({ sessionId, t, useProjection, applyUnattended }) {
      const unattended = useProjection("unattended");
      const permission = useProjection("permissions");
      const [busy, setBusy] = React.useState(false);
      // 能力缺失（未装本插件）或非自动审查模式时不出现。
      if (unattended === undefined || permission === null || permission === undefined) return null;
      if (permission.currentValue !== "auto") return null;
      const enabled = unattended === true;
      const title = t(enabled ? "title.on" : "title.off");
      const run = () => {
        if (busy) return;
        setBusy(true);
        applyUnattended(sessionId, enabled ? "off" : "on")
          .catch((error) => console.error("[unattended] switch failed:", error))
          .then(() => setBusy(false));
      };
      return React.createElement(
        "button",
        {
          type: "button",
          className: "dsh-unattended" + (enabled ? " is-on" : ""),
          "aria-pressed": enabled,
          "aria-label": title,
          title,
          disabled: busy,
          onClick: run,
        },
        React.createElement(
          "svg",
          { viewBox: "0 0 16 16", "aria-hidden": true, focusable: false },
          React.createElement("path", {
            fill: "currentColor",
            d: "M13.4 9.6a5.7 5.7 0 0 1-7-7 5.8 5.8 0 1 0 7 7Z",
          }),
        ),
        React.createElement("span", { className: "dsh-unattended-label" }, t(enabled ? "label.on" : "label.off")),
      );
    }

    return {
      inject: ["slots", "locale", "sessions"],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), "unattended: dictionaries");
        ctx.effect(() => {
          if (typeof document === "undefined") return;
          if (document.querySelector('style[data-plugin-css="' + STYLE_ID + '"]') !== null) return;
          const tag = document.createElement("style");
          tag.dataset.plugin = "dsh-unattended";
          tag.dataset.pluginCss = STYLE_ID;
          tag.textContent = css;
          document.head.appendChild(tag);
          return () => {
            tag.remove();
          };
        }, "unattended: styles");
        ctx.slots.inject("conversation.input.left", () =>
          ctx.slots.register(
            {
              name: "conversation.input.left",
              id: "unattended",
              order: 20,
              locale: NS,
              inject: () => ({
                applyUnattended: async (sessionId, mode) => {
                  const live = ctx.sessions.binding(sessionId)?.session;
                  if (live === undefined) throw new Error("this session is not materialized yet");
                  const result = await live.command(`/unattended ${mode}`);
                  if (!result.ok) throw new Error(`unattended switch failed: ${result.error.code}: ${result.error.message}`);
                },
              }),
            },
            UnattendedToggle,
          ),
        );
      },
    };
  },
});
