import { statSync } from "node:fs";
import { join } from "node:path";

import autoprefixer from "autoprefixer";
import { deleteAsync } from "del";
import gulp from "gulp";
import postcss from "gulp-postcss";
import sourcemaps from "gulp-sourcemaps";
import File from "vinyl";
import { afterAll, describe, expect, it } from "vitest";

import { createVinyl, normalizeEOL } from "./__fixtures__/index.js";
import { LegacySassError, legacy } from "../src/index.js";

afterAll(async () => {
  await deleteAsync(join(__dirname, "results"));
});

describe("legacy sync render", () => {
  it("should pass file when it isNull()", () =>
    new Promise<void>((resolve) => {
      const emptyFile = {
        isNull: (): boolean => true,
      };
      const stream = legacy();

      stream.on("data", (data: File) => {
        expect(data.isNull()).toEqual(true);
        resolve();
      });
      stream.write(emptyFile);
    }));

  it("should emit error when file isStream()", () =>
    new Promise<void>((resolve) => {
      const stream = legacy();
      const streamFile = {
        isNull: (): boolean => false,
        isStream: (): boolean => true,
      };

      stream.on("error", (err) => {
        expect(err.message).toEqual("Streaming not supported");
        resolve();
      });
      stream.write(streamFile);
    }));

  it("should compile a single sass file", () =>
    new Promise<void>((resolve) => {
      const sassFile = createVinyl("mixins.scss");
      const stream = legacy();

      stream.on("data", (cssFile: File.BufferFile) => {
        expect(typeof cssFile.relative).toEqual("string");
        expect(typeof cssFile.path).toEqual("string");
        expect(normalizeEOL(cssFile.contents)).toMatchSnapshot();
        resolve();
      });
      stream.write(sassFile);
    }));

  it("should compile multiple sass files", () =>
    new Promise<void>((resolve) => {
      const sassFiles = [
        createVinyl("mixins.scss"),
        createVinyl("variables.scss"),
      ];
      const stream = legacy();
      let mustSee = sassFiles.length;

      stream.on("data", (cssFile: File.BufferFile) => {
        expect(typeof cssFile.relative).toEqual("string");
        expect(typeof cssFile.path).toEqual("string");
        expect(normalizeEOL(cssFile.contents)).toMatchSnapshot();

        mustSee -= 1;
        if (mustSee <= 0) resolve();
      });

      sassFiles.forEach((file) => stream.write(file));
    }));

  it("should compile files with partials in another folder", () =>
    new Promise<void>((resolve) => {
      const sassFile = createVinyl("inheritance.scss");
      const stream = legacy();

      stream.on("data", (cssFile: File.BufferFile) => {
        expect(typeof cssFile.relative).toEqual("string");
        expect(typeof cssFile.path).toEqual("string");
        expect(normalizeEOL(cssFile.contents)).toMatchSnapshot();
        resolve();
      });
      stream.write(sassFile);
    }));

  it("should emit logError on sass error", () =>
    new Promise((resolve) => {
      const errorFile = createVinyl("error.scss");
      const stream = legacy();

      stream.on("error", legacy.logError.bind(stream));
      stream.on("end", resolve);
      stream.write(errorFile);
    }));

  it("should preserve the original sass error message", () =>
    new Promise<void>((resolve) => {
      const errorFile = createVinyl("error.scss");
      const stream = legacy();

      stream.on("error", (err: LegacySassError) => {
        // Error must include original error message
        expect(err.messageOriginal).toContain('expected "{".');
        // Error must include relativePath property
        expect(err.messageOriginal).toContain(
          join("__tests__", "__fixtures__", "scss", "error.scss"),
        );
        // Error must include line and column error occurs on
        expect(err.messageOriginal).toContain("2:20  root stylesheet");
        resolve();
      });
      stream.write(errorFile);
    }));

  it("should work with gulp-sourcemaps", () =>
    new Promise<void>((resolve) => {
      const sassFile = createVinyl("inheritance.scss");

      sassFile.sourceMap = JSON.stringify({
        version: "3",
        file: "__fixtures__/scss/subdir/multilevelimport.scss",
        names: [],
        mappings: "",
        sources: ["__fixtures__/scss/subdir/multilevelimport.scss"],
        sourcesContent: ["@import ../inheritance;"],
      });
      const stream = legacy();

      stream.on("data", (cssFile) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(cssFile.sourceMap.sources).toEqual([
          "includes/_cats.scss",
          "includes/_dogs.sass",
          "inheritance.scss",
        ]);
        resolve();
      });
      stream.write(sassFile);
    }));

  it("should work with gulp-sourcemaps and a globbed source", () =>
    new Promise((resolve) => {
      gulp
        .src(join(__dirname, "__fixtures__/scss/globbed/**/*.scss"))
        .pipe(sourcemaps.init())
        .pipe(legacy())
        .pipe(sourcemaps.write())
        .pipe(gulp.dest(join(__dirname, "results")))
        .on("end", resolve);
    }));

  it("should work with gulp-sourcemaps and autoprefixer", () =>
    new Promise((resolve) => {
      gulp
        .src(join(__dirname, "__fixtures__/scss/globbed/**/*.scss"))
        .pipe(sourcemaps.init())
        .pipe(legacy())
        .pipe(postcss([autoprefixer()]))
        .pipe(sourcemaps.write())
        .pipe(gulp.dest(join(__dirname, "results")))
        .on("end", resolve);
    }));

  it("should work with empty files", () =>
    new Promise<void>((resolve) => {
      gulp
        .src(join(__dirname, "__fixtures__/scss/empty.scss"))
        .pipe(legacy())
        .pipe(gulp.dest(join(__dirname, "results")))

        .on("end", () => {
          const stat = statSync(join(__dirname, "results/empty.css"));

          expect(stat.size).toEqual(0);
          resolve();
        });
    }));
});
