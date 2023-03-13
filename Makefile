development:
	NODE_ENV=development npx webpack serve

production:
	npx webpack

clean:
	rm -rf dist
