dev development:
	@echo "Starting dev server...";
	@echo "Hosting at http://localhost:8080/main.user.js";
	@NODE_ENV=development npx webpack serve;

build:
	@echo "Building...";
	@npx webpack;
	@echo "Done.";

update-version:
	@echo "Updating version... (dummy)";
	@echo "Done.";

prod production: clean update-version build

clean:
	@echo "Cleaning previous build...";
	rm -rf dist;
