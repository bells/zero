import "./style.css";
import {
  isRecord,
  isThread,
  parseCreate,
  type FrameMessage,
  type PublicFeedback,
  type ThreadId,
} from "../shared/contracts.ts";
import {
  element,
  field,
  request,
  readPage,
  RequestError,
  setThemeControl,
} from "./ui.ts";
const params = new URLSearchParams(location.search);
const zh = params.get("locale") !== "en";
const c = zh
  ? {
      title: "反馈与建议",
      intro: "欢迎提出问题、改进建议和新工具需求。",
      body: "反馈内容",
      nick: "昵称（可选）",
      email: "邮箱（可选，仅站长可见）",
      submit: "提交反馈",
      received: "已收到，等待审核。审核后才会公开，不承诺处理时间。",
      list: "已审核反馈",
      empty: "还没有公开反馈。欢迎留下第一条建议。",
      loading: "正在加载反馈…",
      guest: "游客",
      owner: "站长",
      replies: "站长回复",
      more: "下一页",
      first: "返回第一页",
      retry: "重新加载",
      theme: "外观",
      themes: ["跟随系统", "浅色", "深色"],
      privacy:
        "这里主动填写的反馈将上传到独立服务，审核后可能公开；邮箱仅供站长私下联系。工具输入、结果、文件和搜索不会自动附带。请勿粘贴密钥或私有内容。",
      metadata:
        "服务商可能保留连接元数据，反馈不等于网络匿名。本页不保存资料或草稿，不提供自动邮件通知。",
      errors: {
        invalid_input:
          "请检查正文（1–2000 字符）、昵称（最多 40 字符）和邮箱格式。",
        rate_limited: "提交过于频繁，请稍后手动重试。",
        timeout: "请求超时，提交结果可能未知。草稿仍在，可手动重试同一次提交。",
        conflict: "这次提交的内容已改变，请检查后重新提交。",
        unavailable: "反馈服务暂时不可用，草稿仍在，请稍后重试。",
        unauthorized: "反馈暂时不可用。",
        forbidden: "反馈暂时不可用。",
        not_found: "反馈暂时不可用。",
      },
    }
  : {
      title: "Feedback and suggestions",
      intro: "Report a problem, suggest an improvement or request a new tool.",
      body: "Feedback text",
      nick: "Nickname (optional)",
      email: "Email (optional, private to the maintainer)",
      submit: "Submit feedback",
      received:
        "Received for review. It becomes public only after moderation; response time is not guaranteed.",
      list: "Reviewed feedback",
      empty: "No public feedback yet. You can leave the first suggestion.",
      loading: "Loading feedback…",
      guest: "Guest",
      owner: "Maintainer",
      replies: "Maintainer responses",
      more: "Next page",
      first: "First page",
      retry: "Reload feedback",
      theme: "Appearance",
      themes: ["System", "Light", "Dark"],
      privacy:
        "Feedback you enter here is sent to a separate service and may become public after review. Email stays private to the maintainer. Tool inputs, results, files and searches are not attached. Do not paste secrets or private content.",
      metadata:
        "Hosting providers may retain connection metadata; feedback is not network-anonymous. This page saves no profile or draft and sends no automatic email notifications.",
      errors: {
        invalid_input:
          "Check the text (1–2000 characters), nickname (up to 40 characters) and email format.",
        rate_limited: "Too many submissions. Please retry manually later.",
        timeout:
          "Request timed out; the submission result may be unknown. Your draft remains available for a manual retry of this attempt.",
        conflict:
          "This attempt has changed. Check the text before submitting again.",
        unavailable:
          "Feedback is temporarily unavailable. Your draft remains available; retry later.",
        unauthorized: "Feedback is unavailable.",
        forbidden: "Feedback is unavailable.",
        not_found: "Feedback is unavailable.",
      },
    };
document.documentElement.lang = zh ? "zh-CN" : "en";
document.title = c.title;
const root = document.querySelector<HTMLElement>("#app")!;
root.replaceChildren();
const message = (value: FrameMessage) => {
  if (parent !== window) parent.postMessage(value, "*");
};
const status = element("p");
status.setAttribute("role", "status");
status.setAttribute("aria-live", "polite");
const subject = params.get("threadId");
root.append(element("h1", c.title), element("p", c.intro));
if (
  !isThread(subject) ||
  [...params.keys()].some((key) => !["threadId", "locale"].includes(key))
) {
  root.append(element("p", c.errors.invalid_input));
  message({ version: 1, type: "error", code: "unavailable" });
} else {
  const subjects: Record<ThreadId, string> = zh
    ? {
        tools: "工具箱建议与新工具需求",
        "tools/timestamp": "时间戳转换",
        "tools/json": "JSON 工具",
        "tools/base64": "Base64 / URL 工具",
        "tools/diff": "文本对比",
        "tools/image-converter": "图片格式转换",
        "tools/image-watermark": "图片文字水印",
        "tools/image-compressor": "图片压缩",
        "tools/markdown": "Markdown 编辑器",
      }
    : {
        tools: "Toolbox suggestions and new tools",
        "tools/timestamp": "Timestamp conversion",
        "tools/json": "JSON tools",
        "tools/base64": "Base64 / URL tools",
        "tools/diff": "Text comparison",
        "tools/image-converter": "Image converter",
        "tools/image-watermark": "Image text watermark",
        "tools/image-compressor": "Image compressor",
        "tools/markdown": "Markdown editor",
      };
  root.append(
    element("p", subjects[subject]),
    setThemeControl(c.theme, c.themes),
    element("p", c.privacy),
    element("p", c.metadata),
  );
  const form = element("form");
  form.autocomplete = "off";
  const bodyLabel = element("label", c.body);
  const content = element("textarea");
  content.name = "content";
  content.required = true;
  content.rows = 5;
  content.spellcheck = false;
  bodyLabel.append(content);
  const nick = field(c.nick, "nickname");
  const email = field(c.email, "email", "email");
  const details = element("div");
  details.className = "optional-fields";
  details.append(nick.label, email.label);
  const submit = element("button", c.submit);
  submit.type = "submit";
  form.append(bodyLabel, details, submit, status);
  root.append(form);
  const listSection = element("section");
  listSection.setAttribute("aria-label", c.list);
  listSection.append(element("h2", c.list));
  const list = element("div");
  list.dataset.feedbackList = "";
  const listStatus = element("p", c.loading);
  listStatus.setAttribute("aria-live", "polite");
  const next = element("button", c.more);
  const first = element("button", c.first);
  const reload = element("button", c.retry);
  next.hidden = true;
  first.hidden = true;
  const navigation = element("div");
  navigation.className = "actions";
  navigation.append(first, next, reload);
  listSection.append(listStatus, list, navigation);
  root.append(listSection);
  let cursor: string | null = null;
  let attempt: { key: string; payload: string } | null = null;
  const failure = (error: unknown) =>
    c.errors[error instanceof RequestError ? error.code : "unavailable"];
  async function loadReplies(
    row: PublicFeedback,
    host: HTMLElement,
    cursorValue: string | null = null,
  ) {
    const page = readPage(
      await request(
        `/api/feedback?threadId=${encodeURIComponent(subject!)}&parentId=${encodeURIComponent(row.id)}${cursorValue ? `&cursor=${cursorValue}` : ""}`,
      ),
    );
    host.replaceChildren();
    for (const reply of page.items) {
      const section = element("div");
      section.className = "reply";
      section.append(element("strong", c.owner), element("p", reply.content));
      host.append(section);
    }
    if (!page.items.length) host.append(element("p", c.empty));
    if (page.nextCursor) {
      const more = element("button", c.more);
      more.addEventListener("click", () => {
        void loadReplies(row, host, page.nextCursor).catch((error: unknown) => {
          listStatus.textContent = failure(error);
        });
      });
      host.append(more);
    }
  }
  async function load(cursorValue: string | null = null) {
    listStatus.textContent = c.loading;
    reload.disabled = true;
    try {
      const page = readPage(
        await request(
          `/api/feedback?threadId=${encodeURIComponent(subject!)}${cursorValue ? `&cursor=${cursorValue}` : ""}`,
        ),
      );
      list.replaceChildren();
      for (const row of page.items) {
        const article = element("article");
        const header = element("div");
        header.className = "item-heading";
        const time = element(
          "time",
          new Date(row.createdAt).toLocaleString(zh ? "zh-CN" : "en"),
        );
        time.dateTime = row.createdAt;
        const role = element(
          "span",
          row.authorRole === "owner"
            ? zh
              ? "已验证站长"
              : "Verified maintainer"
            : zh
              ? "访客"
              : "Visitor",
        );
        role.className = "author-role";
        role.dataset.authorRole = row.authorRole;
        header.append(
          element(
            "strong",
            row.displayName || (row.authorRole === "owner" ? c.owner : c.guest),
          ),
          role,
          time,
        );
        const replies = element("div");
        const button = element("button", c.replies);
        button.addEventListener("click", () => {
          button.disabled = true;
          void loadReplies(row, replies)
            .catch((error: unknown) => {
              listStatus.textContent = failure(error);
            })
            .finally(() => {
              button.disabled = false;
            });
        });
        article.append(header, element("p", row.content), button, replies);
        list.append(article);
      }
      listStatus.textContent = page.items.length ? "" : c.empty;
      cursor = page.nextCursor;
      next.hidden = !cursor;
      first.hidden = !cursorValue;
    } catch (error) {
      listStatus.textContent = failure(error);
    } finally {
      reload.disabled = false;
    }
  }
  next.addEventListener("click", () => {
    void load(cursor);
  });
  first.addEventListener("click", () => {
    void load();
  });
  reload.addEventListener("click", () => {
    void load();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const values = {
      threadId: subject,
      content: content.value,
      nickname: nick.input.value,
      email: email.input.value,
    };
    const serialized = JSON.stringify(values);
    if (!attempt || attempt.payload !== serialized)
      attempt = { payload: serialized, key: crypto.randomUUID() };
    const input = parseCreate({ ...values, idempotencyKey: attempt.key });
    if (!input) {
      status.textContent = c.errors.invalid_input;
      return;
    }
    const submittedContent = content.value;
    const submittedKey = attempt.key;
    submit.disabled = true;
    status.textContent = c.loading;
    void request("/api/feedback", "POST", input)
      .then((value) => {
        if (
          !isRecord(value) ||
          value.status !== "awaiting_moderation" ||
          typeof value.receiptId !== "string"
        )
          throw new RequestError("unavailable");
        if (content.value === submittedContent) {
          status.textContent = c.received;
          content.value = "";
        } else {
          status.textContent = zh
            ? "刚才的反馈已收到，等待审核。新编辑的草稿尚未提交。"
            : "Previous feedback received for review. Your edited draft has not been submitted.";
        }
        if (attempt?.key === submittedKey) attempt = null;
      })
      .catch((error: unknown) => {
        status.textContent = failure(error);
      })
      .finally(() => {
        submit.disabled = false;
      });
  });
  message({ version: 1, type: "ready" });
  void load();
}
let lastHeight = 0;
new ResizeObserver(() => {
  const height = Math.max(
    240,
    Math.min(1600, Math.ceil(root.getBoundingClientRect().height) + 32),
  );
  if (height !== lastHeight) {
    lastHeight = height;
    message({ version: 1, type: "resize", height });
  }
}).observe(root);
