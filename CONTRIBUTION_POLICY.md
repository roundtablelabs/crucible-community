# Contribution Policy

This document clarifies what types of contributions we accept and how to ensure your contribution aligns with project goals.

## ✅ We Welcome Contributions In

### High Priority (Always Welcome)
- **Bug Fixes** - Fix reported issues, improve error handling
- **Documentation** - Fix typos, clarify instructions, add examples
- **Testing** - Add unit tests, improve test coverage
- **Code Quality** - Refactoring, performance improvements, security fixes
- **UI/UX Improvements** - Better user experience, accessibility improvements

### Medium Priority (Case-by-Case Review)
- **Small Features** - Features that enhance existing functionality
- **Translations** - Internationalization support
- **Integration Improvements** - Better API provider support, compatibility fixes

### Requires Discussion First
- **Major Features** - Large architectural changes or new major functionality
- **API Changes** - Breaking changes to the API
- **Database Schema Changes** - Migration-heavy changes
- **Core Business Logic** - Changes to debate engine, knight system, or core algorithms

## ⚠️ Areas Requiring Extra Caution

### Security-Sensitive Areas
All contributions to these areas require thorough review:
- Authentication and authorization
- API key encryption/decryption
- Password handling
- Session management
- Database queries (SQL injection prevention)
- Input validation and sanitization

### Core Architecture
Changes to these require maintainer approval:
- Database models and migrations
- Core service architecture
- LLM provider integration layer
- Debate execution engine
- PDF generation system

## 🚫 What We Generally Don't Accept

- **Commercial Features** - Features that compete with the commercial version
- **Breaking Changes** - Without prior discussion and approval
- **Proprietary Dependencies** - Adding closed-source dependencies
- **License Incompatible Code** - Code that conflicts with AGPL-3.0
- **Unmaintainable Code** - Code without tests, documentation, or clear purpose

## 📋 Contribution Process

1. **Check First**: Search existing issues/PRs to avoid duplicates
2. **Discuss Large Changes**: Open an issue for discussion before major work
3. **Follow Guidelines**: Read [CONTRIBUTING.md](CONTRIBUTING.md) for detailed process
4. **Be Patient**: Maintainers review contributions as time permits
5. **Stay Engaged**: Respond to review feedback promptly

## 🎯 How to Increase Acceptance Chances

- ✅ **Start Small**: Fix bugs or improve docs first
- ✅ **Follow Standards**: Match existing code style and patterns
- ✅ **Add Tests**: Include tests for new functionality
- ✅ **Update Docs**: Document your changes
- ✅ **Be Responsive**: Address review feedback quickly
- ✅ **Keep PRs Focused**: One feature/fix per PR

## 💡 Questions?

If you're unsure whether your contribution is appropriate:
1. Check existing issues for similar work
2. Open a discussion issue describing your idea
3. Ask in the issue before starting major work

## 📝 License Agreement

By contributing, you agree that:
- Your contributions will be licensed under AGPL-3.0
- You grant Roundtable Labs the right to use your contributions in both AGPL-3.0 (community) and commercial license versions
- You have signed or will sign the Contributor License Agreement (CLA) - see [CLA.md](CLA.md)
- You have the right to contribute the code
- You understand this is a community project, not a commercial service

---

**Note**: This policy may evolve based on community needs and project direction. Check back periodically for updates.
