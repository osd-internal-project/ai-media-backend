# AI Media Backend

## Release & Versioning

This project uses [Semantic Release](https://github.com/semantic-release/semantic-release) to automate version management and package publishing.

### How it works

When you push to the `main` branch, a GitHub Action workflow triggers. It analyzes your commit messages to determine the next version number, generates a changelog, and creates a release.

### Commit Message Convention

To trigger a release, your commit messages **MUST** follow the [Angular Commit Message Convention](https://github.com/angular/angular/blob/master/CONTRIBUTING.md#-commit-message-guidelines):

`type(scope): subject`

#### Types that trigger a release:
- `feat`: A new feature (Minor version bump, e.g., 1.0.0 -> 1.1.0)
- `fix`: A bug fix (Patch version bump, e.g., 1.0.0 -> 1.0.1)
- `perf`: A code change that improves performance (Patch version bump)

#### Types that do NOT trigger a release (unless configured otherwise):
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code (white-space, formatting, etc)
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools and libraries (e.g., this readme update)

#### BREAKING CHANGES
If a commit has a footer `BREAKING CHANGE:`, it triggers a Major version bump (e.g., 1.0.0 -> 2.0.0).

**Example:**
```
feat(auth): add google login support

BREAKING CHANGE: remove email/password login
```

### Generated Artifacts
- **CHANGELOG.md**: Automatically updated with release notes.
- **package.json**: Version is bumped.
- **Git Tag**: A new tag (e.g., `v1.1.0`) is created.
