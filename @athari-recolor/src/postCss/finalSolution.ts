import { Css, PostCss } from "../css/index.ts";
import { OptObject } from "../utils.ts";

interface Opts { }

const defaultOpts: Opts = {};

export type FinalSolutionOptions = OptObject<Opts>;

export default PostCss.declarePlugin<FinalSolutionOptions>('final-solution', defaultOpts, (opts: Opts) => {
    return {
      Comment: (comment: Css.Comment) => {
        if (comment.parent?.nodes?.length === 1)
          comment.parent.remove();
      }
    };
  }
);