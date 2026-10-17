import "./style.css";
import { isRecord } from "../shared/contracts.ts";
import { element, field, request, RequestError } from "./ui.ts";
const root = document.querySelector<HTMLElement>("#app")!;
root.replaceChildren(
  element("h1", "Feedback administration"),
  element(
    "p",
    "Private contacts and exports are visible only after sign-in. Session and drafts remain in memory.",
  ),
);
const status = element("p");
status.setAttribute("role", "status");
root.append(status);
const login = element("form");
login.autocomplete = "off";
const email = field("Email", "email", "email");
const password = field("Password", "password", "password");
const signIn = element("button", "Sign in");
signIn.type = "submit";
login.append(email.label, password.label, signIn);
root.append(login);
const workspace = element("section");
workspace.hidden = true;
root.append(workspace);
let token = "";
let page = 1;
const fail = (error: unknown) => {
  status.textContent =
    error instanceof RequestError
      ? `Request failed: ${error.code}. Retry explicitly.`
      : "Service unavailable. Retry explicitly.";
};
async function refresh() {
  const value = await request(
    `/api/admin/feedback?page=${page}`,
    "GET",
    undefined,
    token,
  );
  if (!isRecord(value) || !Array.isArray(value.items))
    throw new RequestError("unavailable");
  workspace.replaceChildren();
  const actions = element("div");
  actions.className = "actions";
  const logout = element("button", "Sign out");
  logout.addEventListener("click", () => {
    token = "";
    workspace.replaceChildren();
    workspace.hidden = true;
    login.hidden = false;
    password.input.value = "";
  });
  const exportButton = element("button", "Export private JSON");
  exportButton.addEventListener("click", () => {
    void request("/api/admin/export", "GET", undefined, token)
      .then((data) => {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(data)], { type: "application/json" }),
        );
        const link = element("a", "Download private backup");
        link.href = url;
        link.download = "zero-feedback-private.json";
        workspace.prepend(link);
        setTimeout(() => {
          URL.revokeObjectURL(url);
          link.remove();
        }, 60000);
      })
      .catch(fail);
  });
  const next = element("button", "Next page");
  next.disabled =
    typeof value.totalPages !== "number" || page >= value.totalPages;
  next.addEventListener("click", () => {
    page++;
    void refresh().catch(fail);
  });
  const first = element("button", "First page");
  first.disabled = page === 1;
  first.addEventListener("click", () => {
    page = 1;
    void refresh().catch(fail);
  });
  actions.append(logout, exportButton, first, next);
  workspace.append(actions);
  const items: unknown[] = value.items;
  for (const raw of items) {
    if (
      !isRecord(raw) ||
      typeof raw.objectId !== "string" ||
      typeof raw.comment !== "string"
    )
      continue;
    const id = raw.objectId;
    const article = element("article");
    article.append(
      element("h2", `${String(raw.url)} · ${String(raw.status)}`),
      element("p", raw.comment),
      element(
        "p",
        `Private contact: ${typeof raw.mail === "string" ? raw.mail : "none"}`,
      ),
    );
    const controls = element("div");
    controls.className = "actions";
    const action = (label: string, method: string, data?: unknown) => {
      const button = element("button", label);
      button.addEventListener("click", () => {
        button.disabled = true;
        void request(
          `/api/admin/feedback/${encodeURIComponent(id)}`,
          method,
          data,
          token,
        )
          .then(() => {
            status.textContent = "Saved.";
            return refresh();
          })
          .catch(fail)
          .finally(() => {
            button.disabled = false;
          });
      });
      controls.append(button);
    };
    action("Approve", "PATCH", { status: "approved" });
    action("Hide", "PATCH", { status: "hidden" });
    action("Reject", "PATCH", { status: "spam" });
    action("Delete", "DELETE");
    article.append(controls);
    const editLabel = element("label", "Edit text");
    const edit = element("textarea", raw.comment);
    editLabel.append(edit);
    const save = element("button", "Save text");
    save.addEventListener("click", () => {
      void request(
        `/api/admin/feedback/${encodeURIComponent(id)}`,
        "PATCH",
        { content: edit.value },
        token,
      )
        .then(refresh)
        .catch(fail);
    });
    article.append(editLabel, save);
    if (!raw.pid && raw.status === "approved") {
      const form = element("form");
      const label = element("label", "Owner reply");
      const reply = element("textarea");
      label.append(reply);
      const publish = element("button", "Publish reply");
      publish.type = "submit";
      form.append(label, publish);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        publish.disabled = true;
        void request(
          "/api/admin/replies",
          "POST",
          { threadId: raw.url, parentId: id, content: reply.value },
          token,
        )
          .then(() => {
            reply.value = "";
            status.textContent = "Reply published.";
          })
          .catch(fail)
          .finally(() => {
            publish.disabled = false;
          });
      });
      article.append(form);
    }
    workspace.append(article);
  }
}
login.addEventListener("submit", (event) => {
  event.preventDefault();
  signIn.disabled = true;
  void request("/api/admin/login", "POST", {
    email: email.input.value,
    password: password.input.value,
  })
    .then((value) => {
      if (!isRecord(value) || typeof value.token !== "string")
        throw new RequestError("unavailable");
      token = value.token;
      password.input.value = "";
      login.hidden = true;
      workspace.hidden = false;
      return refresh();
    })
    .catch(fail)
    .finally(() => {
      signIn.disabled = false;
    });
});
