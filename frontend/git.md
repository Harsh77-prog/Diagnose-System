# 🔎 Why Pull Requests Exist (Overview)

A **Pull Request (PR)** exists to introduce **controlled collaboration** in a project.

It is not just “a way to merge code.”

It exists to:

### 1️⃣ Enable Code Review

- Teammates review changes before merging.
- Prevents bugs, bad patterns, or insecure code.
- Improves code quality and shared understanding.

---

### 2️⃣ Protect the Main Branch

- Prevent direct pushes to production.
- Keep `main` always stable.
- Run automated CI tests before merge.

---

### 3️⃣ Maintain Clean Project History

- Groups related commits into a single logical change.
- Makes rollback easier.
- Makes debugging easier.

---

### 4️⃣ Encourage Structured Collaboration

Instead of:

> “Push and hope it works”

You get:

> Propose → Discuss → Improve → Approve → Merge

---

# 🔄 Two Types of Pull Requests

There are **two valid PR flows**:

1. ✅ **Fork-based Pull Request**
2. ✅ **Direct (Branch-based) Pull Request inside same repository**

Let’s cover both clearly.

---

# 🟢 A) Fork-Based Pull Request (External Contributors)

Used when:

- You don’t have write access
- Open-source contributions

Flow:

```bash
Fork → Clone → Branch → Push → Open PR to original repo
```

You already structured this well.

---

# 🔵 B) Direct Pull Request (Same Repository)

Used when:

- You are part of the organization/team
- You have write access
- No fork needed

This is common in startups and internal teams.

---

# 🌳 Direct Pull Request Workflow (No Fork)

## 1️⃣ Clone the Original Repository

```bash
git clone https://github.com/org-name/repo-name.git
cd repo-name
```

Why?

- You are working directly in main repository
- No fork needed

---

## 2️⃣ Create Feature Branch

```bash
git checkout -b feature/your-feature-name
```

Why?

- Never work on main directly
- Isolates your changes

---

## 3️⃣ Work + Commit

```bash
git status
git add .
git commit -m "feat: implement authentication middleware"
```

---

## 4️⃣ Push Branch to Same Repository

```bash
git push origin feature/your-feature-name
```

Why?

- Uploads your branch to main repository
- Enables PR inside same repo

---

## 5️⃣ Open Pull Request

Go to GitHub:

- Click **Compare & pull request**
- Base branch: `main`
- Compare branch: `feature/your-feature-name`
- Add description
- Create PR

---

# 🔁 Keeping Direct PR Branch Updated

If `main` gets new commits while you’re working:

---

## Option 1: Rebase (Cleaner History)

```bash
git checkout feature/your-feature-name
git fetch origin
git rebase origin/main
```

Then:

```bash
git push origin feature/your-feature-name --force
```

Use when:

- Team prefers clean linear history.

---

## Option 2: Merge (Safer for teams)

```bash
git checkout feature/your-feature-name
git fetch origin
git merge origin/main
git push origin feature/your-feature-name
```

Use when:

- Team wants safe history
- Avoid force push

---

# 🧠 When to Use Fork PR vs Direct PR

| Situation               | Use Fork | Use Direct |
| ----------------------- | -------- | ---------- |
| Open-source contributor | ✅       | ❌         |
| External developer      | ✅       | ❌         |
| Internal team member    | ❌       | ✅         |
| Startup team            | ❌       | ✅         |
| Enterprise org          | ❌       | ✅         |

---

# 🛡 Important: Branch Protection (Required for Direct PR)

If you allow direct PR workflow:

On GitHub → Settings → Branch Protection Rules

Enable:

- Require pull request before merging
- Require approvals
- Require status checks
- Disable force push on main

This ensures:

- No one bypasses PR
- No one pushes directly to main

---

# ⚠️ What NOT To Do in Direct PR Workflow

🚫 Push directly to main
🚫 Force push main
🚫 Merge without review
🚫 Mix multiple features in one PR
🚫 Ignore CI failures

---

# 🏗 Professional Standard Workflow (Direct PR)

```bash
Clone repo
↓
Create feature branch
↓
Commit small logical changes
↓
Push branch
↓
Open Pull Request
↓
Review + CI
↓
Merge (Squash or Rebase)
↓
Delete branch
```

---

# 🧩 Advanced (Recommended for Clean History)

When merging PR:

Choose:

### 🔹 Squash and Merge (Recommended for startups)

- Combines all commits into one
- Clean history

### 🔹 Rebase and Merge

- Keeps commit history
- Linear history

Avoid:

- Merge commit (unless team explicitly wants it)

---

# 🎯 Final Recommendation

For a serious product:

- Internal team → Direct PR workflow
- External contributors → Fork PR workflow
- Protect main branch
- Require review
- Prefer squash merge
