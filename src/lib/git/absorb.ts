import fs from 'fs-extra';
import path from 'path';
import tmp from 'tmp';
import { runGitCommand, runGitCommandAndSplitLines } from './runner';

export type TStagedHunk = {
  filePath: string;
  fileHeader: string[];
  hunkLines: string[];
  // The range of HEAD lines this hunk modifies (used for blame attribution).
  // A pure insertion has changedOldCount 0 and changedOldStart set to the
  // line the insertion follows.
  changedOldStart: number;
  changedOldCount: number;
};

export type TStagedDiffForAbsorb = {
  hunks: TStagedHunk[];
  unattributableFiles: string[];
};

/**
 * Parses the staged diff (index vs HEAD) into hunks that can each be
 * attributed to the commit that last touched their lines, keeping full
 * context lines so that re-applying a hunk to an ancestor tree is verified
 * against file content rather than raw line numbers.
 *
 * Files without line history to attribute against (new files, binary files)
 * are reported separately and stay staged.
 */
export function getStagedDiffForAbsorb(): TStagedDiffForAbsorb {
  const diff = runGitCommand({
    args: [`diff`, `--cached`, `--no-color`, `--no-ext-diff`, `--no-renames`],
    options: { noTrim: true },
    onError: 'throw',
    resource: 'getStagedDiffForAbsorb',
  });

  const hunks: TStagedHunk[] = [];
  const unattributableFiles: string[] = [];

  const lines = diff.split('\n');
  let fileHeader: string[] = [];
  let filePath: string | undefined = undefined;
  let fileIsAttributable = true;
  let currentHunk:
    | {
        oldStart: number;
        hunkLines: string[];
        filePath: string;
        fileHeader: string[];
      }
    | undefined = undefined;

  const flushHunk = () => {
    if (currentHunk) {
      hunks.push({
        filePath: currentHunk.filePath,
        fileHeader: currentHunk.fileHeader,
        hunkLines: currentHunk.hunkLines,
        ...computeChangedOldRange(currentHunk.oldStart, currentHunk.hunkLines),
      });
      currentHunk = undefined;
    }
  };

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      flushHunk();
      fileHeader = [line];
      filePath = undefined;
      fileIsAttributable = true;
      continue;
    }
    if (fileHeader.length === 0) {
      continue;
    }

    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/);
    if (hunkMatch) {
      flushHunk();
      if (!filePath || !fileIsAttributable) {
        continue;
      }
      currentHunk = {
        oldStart: parseInt(hunkMatch[1], 10),
        hunkLines: [line],
        filePath,
        fileHeader,
      };
      continue;
    }

    if (currentHunk) {
      currentHunk.hunkLines.push(line);
      continue;
    }

    // File header section.
    fileHeader.push(line);
    if (line.startsWith('+++ b/')) {
      filePath = line.slice('+++ b/'.length);
    }
    if (
      line.startsWith('--- /dev/null') || // new file: no history to absorb into
      line.startsWith('Binary files') ||
      line.startsWith('GIT binary patch')
    ) {
      fileIsAttributable = false;
      const nameFromDiffLine = fileHeader[0].match(
        /^diff --git a\/.* b\/(.*)$/
      );
      if (nameFromDiffLine) {
        unattributableFiles.push(nameFromDiffLine[1]);
      }
    }
  }
  flushHunk();

  return { hunks, unattributableFiles: [...new Set(unattributableFiles)] };
}

// Walks a hunk body to find the range of old-side lines actually modified
// (excluding context lines).
function computeChangedOldRange(
  oldStart: number,
  hunkLines: string[]
): { changedOldStart: number; changedOldCount: number } {
  let oldLine = oldStart;
  let minChanged: number | undefined = undefined;
  let maxChanged: number | undefined = undefined;
  let insertionAnchor: number | undefined = undefined;

  for (const line of hunkLines.slice(1)) {
    if (line.startsWith('-')) {
      minChanged = minChanged ?? oldLine;
      maxChanged = oldLine;
      oldLine++;
    } else if (line.startsWith('+')) {
      insertionAnchor = insertionAnchor ?? oldLine - 1;
    } else if (line.startsWith('\\')) {
      // "\ No newline at end of file"
    } else {
      oldLine++;
    }
  }

  return minChanged !== undefined && maxChanged !== undefined
    ? {
        changedOldStart: minChanged,
        changedOldCount: maxChanged - minChanged + 1,
      }
    : { changedOldStart: insertionAnchor ?? 0, changedOldCount: 0 };
}

// Reassembles hunks into a patch, emitting each file's header once followed
// by its hunks in their original order.
export function buildPatch(hunks: TStagedHunk[]): string {
  const lines: string[] = [];
  let lastHeader: string[] | undefined = undefined;
  hunks.forEach((hunk) => {
    if (hunk.fileHeader !== lastHeader) {
      lines.push(...hunk.fileHeader);
      lastHeader = hunk.fileHeader;
    }
    lines.push(...hunk.hunkLines);
  });
  return lines.length > 0 ? [...lines, ''].join('\n') : '';
}

// Full-context patches used to restore the user's uncommitted state after
// the absorbed branches have been rewritten and restacked.
export function getStagedPatchForFiles(files: string[]): string {
  return runGitCommand({
    args: [
      `diff`,
      `--cached`,
      `--binary`,
      `--no-color`,
      `--no-ext-diff`,
      `--`,
      ...files,
    ],
    options: { noTrim: true },
    onError: 'throw',
    resource: 'getStagedPatchForFiles',
  });
}

export function getUnstagedPatch(): string {
  return runGitCommand({
    args: [`diff`, `--binary`, `--no-color`, `--no-ext-diff`],
    options: { noTrim: true },
    onError: 'throw',
    resource: 'getUnstagedPatch',
  });
}

// The commits that last touched the given range of the HEAD version of a
// file; the old side of the staged diff is exactly the HEAD content.
export function blameRange(
  filePath: string,
  start: number,
  count: number
): string[] {
  return runGitCommandAndSplitLines({
    args: [
      `blame`,
      `-l`,
      `-s`,
      `--root`,
      `-L`,
      `${start},+${count}`,
      `HEAD`,
      `--`,
      filePath,
    ],
    onError: 'ignore',
    resource: 'blameRange',
  })
    .map((line) => line.split(' ')[0].replace(/^\^/, ''))
    .filter((sha) => sha.length > 0);
}

export function applyPatch(patchPath: string, opts: { index?: boolean }): void {
  runGitCommand({
    args: [`apply`, ...(opts.index ? [`--index`] : []), patchPath],
    options: { stdio: 'pipe' },
    onError: 'throw',
    resource: 'applyPatch',
  });
}

export function addPatch(): void {
  runGitCommand({
    args: [`add`, `--patch`],
    options: { stdio: 'inherit' },
    onError: 'throw',
    resource: 'addPatch',
  });
}

/**
 * Rewrites the tip commit of a branch to additionally contain the given
 * patch, without touching the working tree or the real index: the branch's
 * tree is loaded into a temporary index, the patch is applied there (with
 * content verification), and an amended commit (same parents, message, and
 * author) replaces the tip. Throws if the patch does not apply to the
 * branch's tree.
 */
export function amendBranchTipWithPatch(
  branchName: string,
  patchPath: string
): string {
  const tmpIndex = tmp.fileSync();
  try {
    const env = { ...process.env, GIT_INDEX_FILE: tmpIndex.name };

    runGitCommand({
      args: [`read-tree`, branchName],
      options: { env },
      onError: 'throw',
      resource: 'absorbReadTree',
    });
    runGitCommand({
      args: [`apply`, `--cached`, patchPath],
      options: { env, stdio: 'pipe' },
      onError: 'throw',
      resource: 'absorbApplyToTree',
    });
    const tree = runGitCommand({
      args: [`write-tree`],
      options: { env },
      onError: 'throw',
      resource: 'absorbWriteTree',
    });

    const oldSha = runGitCommand({
      args: [`rev-parse`, branchName],
      onError: 'throw',
      resource: 'absorbRevParse',
    });
    const [, ...parents] = runGitCommand({
      args: [`rev-list`, `--parents`, `-n`, `1`, oldSha],
      onError: 'throw',
      resource: 'absorbParents',
    }).split(' ');
    const [authorName, authorEmail, authorDate, message] = runGitCommand({
      args: [`log`, `-1`, `--format=%an%x00%ae%x00%aD%x00%B`, oldSha],
      options: { noTrim: true },
      onError: 'throw',
      resource: 'absorbCommitInfo',
    }).split('\x00');

    const newSha = runGitCommand({
      args: [
        `commit-tree`,
        tree,
        ...parents.flatMap((parent) => [`-p`, parent]),
        `-F`,
        `-`,
      ],
      options: {
        input: message,
        env: {
          ...env,
          GIT_AUTHOR_NAME: authorName,
          GIT_AUTHOR_EMAIL: authorEmail,
          GIT_AUTHOR_DATE: authorDate,
        },
      },
      onError: 'throw',
      resource: 'absorbCommitTree',
    });

    runGitCommand({
      args: [`update-ref`, `refs/heads/${branchName}`, newSha, oldSha],
      options: { stdio: 'pipe' },
      onError: 'throw',
      resource: 'absorbUpdateRef',
    });

    return newSha;
  } finally {
    tmpIndex.removeCallback();
  }
}

export function writeRecoveryPatch(
  gitDir: string,
  name: string,
  contents: string
): string {
  const patchPath = path.join(gitDir, name);
  fs.writeFileSync(patchPath, contents);
  return patchPath;
}
