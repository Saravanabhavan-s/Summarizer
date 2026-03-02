import * as Motion from 'framer-motion';

const MotionDiv = Motion.motion.div;

const pageVariants = {
  initial:  { opacity: 0, y: 8 },
  animate:  { opacity: 1, y: 0 },
  exit:     { opacity: 0, y: -8 },
};

const pageTransition = {
  duration: 0.35,
  ease: 'easeInOut',
};

export default function PageWrapper({ children }) {
  return (
    <MotionDiv
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
    >
      {children}
    </MotionDiv>
  );
}
