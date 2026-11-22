"use client";
import { ByteHero } from "@/ui/landing/byte-hero";
import { AsideText } from "./form-bits";

export function SignupAside() {
  return (
    <div className="flex flex-col items-start">
      <AsideText kicker="Join HeapHop" title="See inside your code.">
        Step through real C++ and watch the stack, the heap and every pointer change. Byte will show you around.
      </AsideText>
      <div className="self-center"><ByteHero /></div>
    </div>
  );
}
