build: clean
	@echo "Building...";
	@npx webpack;
	@echo "Done.";

dev development:
	@echo "Starting dev server...";
	@echo "Hosting at http://localhost:8080/main.user.js";
	@NODE_ENV=development npx webpack serve;

update-version:
	@echo "Updating version... (dummy)";
	@echo "Done.";

prod production: build update-version

clean:
	@echo "Cleaning previous build...";
	rm -rf dist;
