# repo-to-text Repo to Text Converter

Converts Git repositories, directories, or zip files into searchable TXT or PDF documents with filtering capabilities.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create `.env` file:

```env
INPUT_PATH=./inputs/your_repo.zip     # Your input file/directory
OUTPUT_PATH=./outputs/your_output      # Where to save output
OUTPUT_FORMAT=txt                      # 'txt' or 'pdf'
PROJECT_TYPE=springboot,reactvite      # Project types to process
NUM_CHUNKS=1                          # Split output into chunks (optional)
PATH_TYPE=relative                    # File path display type ('relative' or 'absolute')
```

3. Add your input file:

- Place zip file in `inputs/` directory, or
- Set INPUT_PATH to your repository URL/local path

4. Run converter:

```bash
npm start
```

## Project Types

Supported project types (add in PROJECT_TYPE):

- springboot
- reactvite
- java_db
- golang_api
- golang_db

Each type uses specific whitelist/blacklist patterns from the `config/` directory.

## Example .env Settings

```env
# For a Spring Boot project
INPUT_PATH=./inputs/backend.zip
OUTPUT_PATH=./outputs/backend_docs
OUTPUT_FORMAT=txt
PROJECT_TYPE=springboot
PATH_TYPE=relative

# For multiple project types
INPUT_PATH=./inputs/fullstack.zip
OUTPUT_PATH=./outputs/fullstack_docs
PROJECT_TYPE=springboot,reactvite,java_db
PATH_TYPE=absolute
```

## Output

- Files are generated in the specified OUTPUT_PATH
- Format follows: `output.txt` or `output_1.txt`, `output_2.txt` (if using chunks)
