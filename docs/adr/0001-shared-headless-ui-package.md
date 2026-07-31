# Shared headless UI package

SlopCop's reusable Foldkit components live in a private `@slopcop/ui` workspace package rather than in `apps/web` or directly upstream in `@foldkit/ui`. The package remains domain-agnostic and follows Foldkit UI's headless composition conventions, allowing SlopCop to evolve components against its own needs before any later upstream extraction while keeping repository selection, navigation, styling, and other application policy in `apps/web`.
