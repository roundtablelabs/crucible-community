# Contributing to Crucible Community Edition

Thank you for your interest in contributing to Crucible Community Edition! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

This project adheres to a Code of Conduct that all contributors are expected to follow. Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before participating.

## Getting Started

### Prerequisites

- **Docker** 20.10+ and **Docker Compose** v2+
- **Node.js** 18+ (for frontend development)
- **Python** 3.11+ (for backend development)
- **Git** for version control

### Development Setup

1. **Fork and clone the repository:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/crucible-community.git
   cd crucible-community
   ```

2. **Set up development environment:**
   ```bash
   # Start services in development mode (builds from source)
   docker compose -f docker-compose.yml up -d --build
   ```

3. **Access the application:**
   - Frontend: http://localhost:3000
   - API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

## Development Workflow

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring
- `test/description` - Test additions/updates

### Making Changes

1. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes:**
   - Follow coding standards (see below)
   - Write or update tests as needed
   - Update documentation if necessary

3. **Test your changes:**
   ```bash
   # Frontend linting
   cd frontend && npm run lint
   
   # Backend linting (if configured)
   cd service && ruff check .
   ```

4. **Commit your changes:**
   ```bash
   git add .
   git commit -m "feat: add new feature description"
   ```

### Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Test additions or changes
- `chore:` - Build process or auxiliary tool changes

Example:
```
feat: add custom branding configuration

- Add environment variables for company name and contact email
- Update legal pages to use configurable values
- Maintain backward compatibility with defaults
```

### Pull Request Process

1. **Push your branch:**
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Create a Pull Request:**
   - Use a clear, descriptive title
   - Fill out the PR template (if available)
   - Reference any related issues
   - Describe what changes were made and why

3. **PR Description Template:**
   ```markdown
   ## Description
   Brief description of changes

   ## Type of Change
   - [ ] Bug fix
   - [ ] New feature
   - [ ] Documentation update
   - [ ] Refactoring
   - [ ] Other (please describe)

   ## Testing
   - [ ] Tests pass locally
   - [ ] Manual testing completed
   - [ ] Documentation updated

   ## Checklist
   - [ ] Code follows style guidelines
   - [ ] Self-review completed
   - [ ] Comments added for complex code
   - [ ] Documentation updated
   - [ ] No new warnings generated
   ```

4. **Respond to feedback:**
   - Address review comments
   - Update your branch as needed
   - Keep discussions focused and constructive

## Coding Standards

### Frontend (TypeScript/React)

- **TypeScript**: Use TypeScript for all new code
- **React**: Follow React best practices and hooks patterns
- **Styling**: Use Tailwind CSS utility classes
- **Components**: Keep components focused and reusable
- **File Structure**: Follow existing feature-based organization
- **Linting**: Code must pass ESLint checks (`npm run lint`)

### Backend (Python/FastAPI)

- **Python Version**: Target Python 3.11+
- **Style**: Follow PEP 8, use `ruff` for linting
- **Type Hints**: Use type hints for all function signatures
- **Async**: Prefer async/await patterns
- **Error Handling**: Use proper exception handling
- **Documentation**: Add docstrings to functions and classes

### General Guidelines

- **Code Comments**: Add comments for complex logic
- **Naming**: Use descriptive, clear names
- **DRY**: Don't repeat yourself - extract common functionality
- **Security**: Follow security best practices
- **Performance**: Consider performance implications

## Project Structure

```
crucible-community/
├── frontend/          # Next.js frontend application
│   ├── app/          # Next.js App Router pages and API routes
│   ├── components/   # React components
│   ├── features/     # Feature-based modules
│   ├── lib/          # Utilities and helpers
│   └── public/       # Static assets
├── service/          # FastAPI backend service
│   ├── app/
│   │   ├── api/      # API routes
│   │   ├── core/     # Core functionality
│   │   ├── models/   # Database models
│   │   ├── services/ # Business logic
│   │   └── workers/   # Celery workers
├── docs/             # Documentation
└── scripts/          # Setup and utility scripts
```

## Areas for Contribution

We welcome contributions in the following areas:

### Bug Fixes
- Fix issues reported in GitHub Issues
- Improve error handling
- Enhance error messages

### Features
- New functionality that aligns with the project goals
- Performance improvements
- UI/UX enhancements

### Documentation
- Improve existing documentation
- Add examples and tutorials
- Fix typos and clarify instructions
- Translate documentation (if applicable)

### Testing
- Add unit tests
- Add integration tests
- Improve test coverage
- Add test utilities

### Code Quality
- Refactoring for better maintainability
- Performance optimizations
- Security improvements

## Reporting Bugs

1. **Check existing issues** to see if the bug has already been reported
2. **Create a new issue** with:
   - Clear, descriptive title
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, Docker version, etc.)
   - Relevant logs or error messages
   - Screenshots if applicable

## Requesting Features

1. **Check existing issues** for similar feature requests
2. **Create a new issue** with:
   - Clear description of the feature
   - Use case and motivation
   - Proposed implementation approach (if you have one)
   - Any alternatives considered

## Development Tips

### Frontend Development

- Use `npm run dev` in the `frontend/` directory for hot reloading
- Check browser console for errors
- Use React DevTools for debugging

### Backend Development

- API changes are automatically reloaded with `uvicorn --reload`
- Check API logs: `docker compose logs -f api`
- Use FastAPI's interactive docs at http://localhost:8000/docs

### Database Changes

- Update SQLAlchemy models in `service/app/models/`
- Test schema changes by reinitializing the database: `python -m scripts.init_community_db`
- Document breaking changes

### Docker Development

- Use `docker compose -f docker-compose.yml` for development
- Rebuild after dependency changes: `docker compose build`
- View logs: `docker compose logs -f [service-name]`

## Questions?

- Check existing documentation in `docs/`
- Search existing GitHub Issues
- Create a new issue with the `question` label

## Contributor License Agreement (CLA)

Before we can accept your contributions, you must sign our Contributor License Agreement (CLA). This enables us to:
- License your contributions under AGPL-3.0 (community edition)
- Offer commercial licenses to enterprises that need AGPL exceptions
- Maintain dual licensing flexibility

### How to Sign the CLA

**Option 1: GitHub Bot (Recommended)**
- When you open a Pull Request, our CLA bot will automatically check if you've signed
- If not signed, add a comment to your PR: **"I have read the CLA and agree to its terms"**
- The bot will automatically record your signature and update the PR status

**Option 2: Manual Signing**
1. Read the [CLA.md](CLA.md) document
2. If you agree to the terms, add a comment to your Pull Request stating: "I have read the CLA and agree to its terms"

**Option 3: DCO (Developer Certificate of Origin)**
- Use the DCO format in your commit messages:
  ```
  Signed-off-by: Your Name <your.email@example.com>
  ```

For corporate contributions, please contact us for a Corporate CLA.

## License

By contributing, you agree that your contributions will be licensed under AGPL-3.0, and you grant Roundtable Labs the right to use your contributions in both AGPL-3.0 (community) and commercial license versions.

Thank you for contributing to Crucible Community Edition!
